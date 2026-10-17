import { expect, test } from "bun:test"
import {
  BasePipelineSolver,
  BaseSolver,
  definePipelineStep,
  type SolverExecutor,
  type SolverOptions,
  type SolverTaskModule,
} from "../lib"
import { handlers, type TestTasks } from "./fixtures/solver-executor/tasks"

const taskModule: SolverTaskModule<TestTasks> = {
  handlers,
  workerUrl: new URL("./fixtures/solver-executor/worker.ts", import.meta.url),
}

class SquaresSolver extends BaseSolver {
  output: number[] = []
  threadIds: number[] = []
  executor?: SolverExecutor<TestTasks>

  constructor(
    readonly values: number[],
    options?: SolverOptions,
  ) {
    super(options)
  }

  override _step(): void {
    this.output = this.values.map((value) => value * value)
    this.solved = true
  }

  protected override async _stepAsync(): Promise<void> {
    this.executor = await this._getTaskExecutor(taskModule)
    const results = await Promise.all(
      this.values.map((value) =>
        this.executor!.execute(
          "test/square",
          { value, delayMs: 1 },
          { shared: undefined },
        ),
      ),
    )
    this.output = results.map((result) => result.value)
    this.threadIds = results.map((result) => result.threadId)
    this.solved = true
  }

  override getOutput(): number[] {
    return this.output
  }
  computeProgress(): number {
    return this.solved ? 1 : 0
  }
}

class SquaresPipeline extends BasePipelineSolver<number[]> {
  pipelineDef = [
    definePipelineStep("first", SquaresSolver, (instance) => [
      instance.inputProblem,
    ]),
    definePipelineStep("second", SquaresSolver, (instance) => [
      instance.getStageOutput<number[]>("first")!,
    ]),
  ]
}

test("existing solver classes have identical sync and async steps and acceptance", async () => {
  class Counter extends BaseSolver {
    override MAX_ITERATIONS = 3
    values: number[] = []
    setups = 0
    override _setup() {
      this.setups++
    }
    override _step() {
      this.values.push(this.iterations)
    }
    override tryFinalAcceptance() {
      this.solved = true
    }
    computeProgress() {
      return this.values.length / 3
    }
  }
  const sync = new Counter()
  const asyncSolver = new Counter()
  expect(sync.solve()).toBeUndefined()
  const pending = asyncSolver.solveAsync()
  expect(asyncSolver.solveAsync()).toBe(pending)
  expect(await pending).toBeUndefined()
  expect({
    values: asyncSolver.values,
    iterations: asyncSolver.iterations,
    setups: asyncSolver.setups,
    solved: asyncSolver.solved,
    failed: asyncSolver.failed,
    progress: asyncSolver.progress,
  }).toEqual({
    values: sync.values,
    iterations: sync.iterations,
    setups: sync.setups,
    solved: sync.solved,
    failed: sync.failed,
    progress: sync.progress,
  })
  expect(asyncSolver.timeToSolve).toBeGreaterThanOrEqual(0)
  await asyncSolver.solveAsync()
  expect(asyncSolver.setups).toBe(1)
  expect(asyncSolver.iterations).toBe(3)
})

test("new SolverClass supports sync, single-thread async, and worker async with the same output", async () => {
  const values = [5, 2, 7, 1, 3, 6]
  const sync = new SquaresSolver(values)
  sync.solve()
  for (const threads of [1, 2, 4]) {
    const solver = new SquaresSolver(values, { threads })
    await solver.solveAsync()
    expect(solver.getOutput()).toEqual(sync.getOutput())
    expect(solver.iterations).toBe(sync.iterations)
    expect(solver.progress).toBe(sync.progress)
    expect(solver.failed).toBe(false)
    expect(
      solver.threadIds.every((id) => (threads === 1 ? id === 0 : id > 0)),
    ).toBe(true)
    expect(new Set(solver.threadIds).size).toBeLessThanOrEqual(threads)
    // The caller does not own or dispose a task executor.
    await expect(
      solver.executor!.execute(
        "test/square",
        { value: 1 },
        { shared: undefined },
      ),
    ).rejects.toThrow("disposed")
  }
})

test("pipeline async solving shares parent resources and preserves logical step counts", async () => {
  const sync = new SquaresPipeline([1, 2, 3])
  sync.solve()
  for (const threads of [1, 2]) {
    const pipeline = new SquaresPipeline([1, 2, 3], { threads })
    // Resume an already-created child, just as solve() can resume step().
    pipeline.step()
    await pipeline.solveAsync()
    expect(pipeline.getAllOutputs()).toEqual(sync.getAllOutputs())
    expect(pipeline.iterations).toBe(sync.iterations)
    expect(pipeline.getStageProgress()).toBe(1)
    const first = pipeline.getSolver<SquaresSolver>("first")!
    const second = pipeline.getSolver<SquaresSolver>("second")!
    expect(first.executor).toBe(second.executor)
    expect(
      first.threadIds.every((id) => (threads === 1 ? id === 0 : id > 0)),
    ).toBe(true)
    await expect(
      second.executor!.execute(
        "test/square",
        { value: 1 },
        { shared: undefined },
      ),
    ).rejects.toThrow("disposed")
  }
})

test("async failure drains accepted tasks and keeps the solver failure", async () => {
  class FailingSolver extends BaseSolver {
    pending?: Promise<unknown>
    executor?: SolverExecutor<TestTasks>
    protected override async _stepAsync() {
      this.executor = await this._getTaskExecutor(taskModule)
      this.pending = this.executor.execute(
        "test/square",
        { value: 8, delayMs: 10 },
        { shared: undefined },
      )
      throw new Error("solver stopped")
    }
  }
  const solver = new FailingSolver()
  await expect(solver.solveAsync()).rejects.toThrow("solver stopped")
  expect(solver.failed).toBe(true)
  expect(solver.error).toContain("FailingSolver error: Error: solver stopped")
  expect(solver.iterations).toBe(1)
  expect(await solver.pending).toMatchObject({ value: 64 })
  await expect(
    solver.executor!.execute(
      "test/square",
      { value: 1 },
      { shared: undefined },
    ),
  ).rejects.toThrow("disposed")
})

test("pipeline async failures stop child workers before the parent promise rejects", async () => {
  class Child extends SquaresSolver {
    protected override async _stepAsync() {
      this.executor = await this._getTaskExecutor(taskModule)
      await this.executor.execute(
        "test/fail",
        { mode: "throw" },
        { shared: undefined },
      )
    }
  }
  class Pipeline extends BasePipelineSolver<number[]> {
    pipelineDef = [
      definePipelineStep("child", Child, (instance) => [instance.inputProblem]),
    ]
  }
  const pipeline = new Pipeline([1])
  await expect(pipeline.solveAsync()).rejects.toThrow("task throw failure")
  const child = pipeline.getSolver<Child>("child")!
  expect(pipeline.failed).toBe(true)
  expect(pipeline.error).toContain("Pipeline error")
  expect(child.failed).toBe(true)
  await expect(
    child.executor!.execute("test/square", { value: 1 }, { shared: undefined }),
  ).rejects.toThrow("disposed")
})

test("async hooks retain iteration limits, and legacy pipeline overrides remain in use", async () => {
  class Limited extends BaseSolver {
    override MAX_ITERATIONS = 2
    protected override async _stepAsync() {
      await Promise.resolve()
    }
  }
  const limited = new Limited()
  await limited.solveAsync()
  expect(limited.failed).toBe(true)
  expect(limited.iterations).toBe(2)
  expect(limited.error).toContain("ran out of iterations")

  class CustomPipeline extends SquaresPipeline {
    calls = 0
    override _step() {
      this.calls++
      super._step()
    }
  }
  const pipeline = new CustomPipeline([2])
  await pipeline.solveAsync()
  expect(pipeline.calls).toBe(pipeline.iterations)
  expect(pipeline.getStageOutput("second")).toEqual([16])
  expect(pipeline.getSolver<SquaresSolver>("first")!.executor).toBeUndefined()
})

test("constructor thread options are validated without changing existing no-option constructors", () => {
  for (const threads of [0, -1, 1.5, NaN, Infinity]) {
    expect(() => new BaseSolver({ threads })).toThrow("positive integer")
  }
  expect(new BaseSolver().solved).toBe(false)
})

test("browser callers construct the same solver and solve asynchronously without a worker", async () => {
  const entrypoint = new URL("../lib/index.ts", import.meta.url).href
  const script = `
    const write = Bun.write.bind(Bun, Bun.stdout)
    Object.defineProperty(globalThis, "process", { value: undefined, configurable: true })
    const api = await import(${JSON.stringify(entrypoint)})
    const taskModule = {
      handlers: { square: (input) => input.value * input.value },
      workerUrl: new URL("file:///missing-worker.js"),
    }
    class Solver extends api.BaseSolver {
      output = []
      async _stepAsync() {
        const tasks = await this._getTaskExecutor(taskModule)
        this.output = await Promise.all([3, 1, 2].map((value) => tasks.execute("square", { value }, { shared: undefined })))
        this.solved = true
      }
    }
    const solver = new Solver({ threads: 4 })
    await solver.solveAsync()
    await write(JSON.stringify({ output: solver.output, solved: solver.solved, iterations: solver.iterations, hasFactory: "createSolverExecutor" in api || "createTaskExecutor" in api || "createInlineSolverExecutor" in api }))
  `
  const child = Bun.spawn(
    [process.execPath, "--preserve-symlinks", "--eval", script],
    { stdout: "pipe", stderr: "pipe" },
  )
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  expect({ code, stderr }).toEqual({ code: 0, stderr: "" })
  expect(JSON.parse(stdout)).toEqual({
    output: [9, 1, 4],
    solved: true,
    iterations: 1,
    hasFactory: false,
  })
})
