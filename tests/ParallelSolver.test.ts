import { expect, test } from "bun:test"
import {
  BaseSolver,
  ParallelSolver,
  SingleThreadSolverRuntime,
  SolverRuntime,
  type ParallelTaskBatch,
  type ParallelTaskOutcome,
} from "../lib"

/** Simulates different dispatch/completion orders without changing logical IDs. */
class ReorderedRuntime implements SolverRuntime {
  reference = new SingleThreadSolverRuntime()
  constructor(private reverse: boolean) {}
  runBatch<I, O, S>(
    batch: ParallelTaskBatch<I, O, S>,
  ): readonly ParallelTaskOutcome<O>[] {
    if (!this.reverse) return this.reference.runBatch(batch)
    return this.reference
      .runBatch({ ...batch, inputs: [...batch.inputs].reverse() })
      .map((outcome) => ({
        ...outcome,
        taskIndex: batch.inputs.length - 1 - outcome.taskIndex,
      }))
  }
  dispose(): void {
    this.reference.dispose()
  }
}

class SquaresSolver extends ParallelSolver<number, number, { offset: number }> {
  values: number[] = []
  batchIndex = 0
  setups = 0
  commits = 0
  constructor(
    readonly inputs: number[],
    runtime?: SolverRuntime,
  ) {
    super({ runtime })
  }
  override _setup(): void {
    this.setups++
  }
  protected getNextBatch(): ParallelTaskBatch<
    number,
    number,
    { offset: number }
  > | null {
    if (this.batchIndex * 2 >= this.inputs.length) return null
    return {
      inputs: this.inputs.slice(this.batchIndex * 2, this.batchIndex * 2 + 2),
      shared: { offset: 3 },
      runTask: (value, { shared }) => value * value + shared.offset,
    }
  }
  protected commitBatch(outputs: readonly number[]): boolean {
    expect(Object.isFrozen(outputs)).toBe(true)
    this.commits++
    this.values.push(...outputs)
    this.batchIndex++
    return this.batchIndex * 2 >= this.inputs.length
  }
  computeProgress(): number {
    return Math.min(1, (this.batchIndex * 2) / this.inputs.length)
  }
  override getOutput(): number[] {
    return this.values
  }
}

function state(solver: SquaresSolver) {
  return {
    output: [...solver.getOutput()],
    batchIndex: solver.batchIndex,
    iterations: solver.iterations,
    progress: solver.progress,
    solved: solver.solved,
    failed: solver.failed,
    commits: solver.commits,
  }
}

test("step and solve are synchronous and have identical logical states across runtime orderings", () => {
  let expected: ReturnType<typeof state>[] | undefined
  for (const runtime of [
    new SingleThreadSolverRuntime(),
    new ReorderedRuntime(false),
    new ReorderedRuntime(true),
  ]) {
    const stepping = new SquaresSolver([7, 1, 4, 2, 5], runtime)
    const trace = []
    while (!stepping.solved && !stepping.failed) {
      expect(stepping.step()).toBeUndefined()
      trace.push(state(stepping))
    }
    if (!expected) expected = trace
    else expect(trace).toEqual(expected)
    const full = new SquaresSolver([7, 1, 4, 2, 5], runtime)
    expect(full.solve()).toBeUndefined()
    expect(state(full)).toEqual(state(stepping))
    expect(full.setups).toBe(1)
    expect(full.iterations).toBe(3)
    expect(full.getOutput()).toEqual([52, 4, 19, 7, 28])
    expect(full.step()).toBeUndefined()
    expect(full.iterations).toBe(3)
    runtime.dispose()
  }
  expect("solveAsync" in BaseSolver.prototype).toBe(false)
})

class FailureSolver extends ParallelSolver<number, number> {
  commits = 0
  protected getNextBatch(): ParallelTaskBatch<number, number> {
    return {
      inputs: [0, 1, 2],
      shared: undefined,
      runTask: (index) => {
        if (index !== 1) throw new TypeError(`task ${index} failed`)
        return 123
      },
    }
  }
  protected commitBatch(): boolean {
    this.commits++
    return true
  }
}

test("the first logical error wins and a failed batch never commits a successful prefix", () => {
  for (const runtime of [
    new SingleThreadSolverRuntime(),
    new ReorderedRuntime(true),
  ]) {
    const solver = new FailureSolver({ runtime })
    expect(() => solver.step()).toThrow("task 0 failed")
    expect(solver.failed).toBe(true)
    expect(solver.commits).toBe(0)
    expect(solver.iterations).toBe(1)
    expect(solver.error).toBe("FailureSolver error: TypeError: task 0 failed")
  }
})

test("invalid result sets are rejected before any state commit", () => {
  const resultSets: unknown[] = [
    [],
    [
      { taskIndex: 0, ok: true, output: 1 },
      { taskIndex: 0, ok: true, output: 2 },
    ],
    [
      { taskIndex: -1, ok: true, output: 1 },
      { taskIndex: 1, ok: true, output: 2 },
    ],
    [
      { taskIndex: 0, ok: true },
      { taskIndex: 1, ok: true, output: 2 },
    ],
    [
      { taskIndex: 0, ok: false, error: {} },
      { taskIndex: 1, ok: true, output: 2 },
    ],
    [
      { taskIndex: 0, ok: true, output: Promise.resolve(1) },
      { taskIndex: 1, ok: true, output: 2 },
    ],
    Promise.resolve([]),
  ]
  for (const outcomes of resultSets) {
    const runtime = { runBatch: () => outcomes, dispose() {} } as SolverRuntime
    const solver = new SquaresSolver([1, 2], runtime)
    expect(() => solver.step()).toThrow()
    expect(solver.failed).toBe(true)
    expect(solver.getOutput()).toEqual([])
    expect(solver.commits).toBe(0)
  }
})

test("runtime infrastructure failures do not commit state", () => {
  const error = new Error("transport failed")
  const runtime: SolverRuntime = {
    runBatch() {
      throw error
    },
    dispose() {},
  }
  const solver = new SquaresSolver([1], runtime)
  expect(() => solver.solve()).toThrow(error)
  expect(solver.commits).toBe(0)
  expect(solver.failed).toBe(true)
})

test("single-thread execution snapshots all inputs first and isolates metadata and outputs", () => {
  const runtime = new SingleThreadSolverRuntime()
  const inputs = [{ values: [1] }, { values: [2] }]
  const shared = { label: "original" }
  const retained: { values: number[]; label: string }[] = []
  const results = runtime.runBatch({
    inputs,
    shared,
    runTask(input, context) {
      // This mutation targets the caller's second input, after both were captured.
      inputs[1]!.values.push(100)
      input.values.push(3)
      const result = { values: input.values, label: context.shared.label }
      context.shared.label = "private"
      retained.push(result)
      return result
    },
  })
  expect(inputs).toEqual([{ values: [1] }, { values: [2, 100, 100] }])
  expect(shared).toEqual({ label: "original" })
  expect(results).toEqual([
    { taskIndex: 0, ok: true, output: { values: [1, 3], label: "original" } },
    { taskIndex: 1, ok: true, output: { values: [2, 3], label: "original" } },
  ])
  retained[0]!.values.push(999)
  expect(results[0]).toEqual({
    taskIndex: 0,
    ok: true,
    output: { values: [1, 3], label: "original" },
  })
})

test("synchronous snapshots preserve cycles, aliases, and shared buffer views", () => {
  const runtime = new SingleThreadSolverRuntime()
  const shared = new SharedArrayBuffer(12)
  new Int32Array(shared).set([1, 2, 3])
  const input: { self?: unknown; buffer: SharedArrayBuffer; view: Int32Array } =
    { buffer: shared, view: new Int32Array(shared, 4, 1) }
  input.self = input
  const [result] = runtime.runBatch({
    inputs: [input],
    shared: undefined,
    runTask: (value) => {
      expect(value.self).toBe(value)
      expect(value.view.buffer).toBe(value.buffer)
      expect(value.view.byteOffset).toBe(4)
      return value
    },
  })
  expect(result?.ok).toBe(true)
  if (!result?.ok) throw new Error("Expected success")
  expect(result.output.self).toBe(result.output)
  expect(result.output.view.buffer).toBeInstanceOf(SharedArrayBuffer)
  new Int32Array(shared)[1] = 42
  expect(result.output.view[0]).toBe(42)
})

test("async task handlers are rejected synchronously", () => {
  const [result] = new SingleThreadSolverRuntime().runBatch({
    inputs: [1],
    shared: undefined,
    runTask: async (value) => value,
  })
  expect(result).toEqual({
    taskIndex: 0,
    ok: false,
    error: {
      name: "TypeError",
      message: "Parallel solver tasks must return synchronously",
    },
  })
})

test("runtime injection, global defaults, and disposal do not alter existing BaseSolver", () => {
  const previous = SolverRuntime.defaultRuntime
  const runtime = new ReorderedRuntime(true)
  const existing = new SquaresSolver([2])
  try {
    SolverRuntime.defaultRuntime = runtime
    const configured = new SquaresSolver([3])
    expect(configured.runtime).toBe(runtime)
    expect(existing.runtime).toBe(previous)
    expect(existing.setRuntime(runtime)).toBe(existing)
    configured.solve()
    existing.solve()
    expect(existing.values).toEqual([7])
    expect(configured.values).toEqual([12])
    expect(runtime.dispose()).toBeUndefined()
    expect(runtime.dispose()).toBeUndefined()
    expect(() => new SquaresSolver([1], runtime).solve()).toThrow("disposed")
  } finally {
    SolverRuntime.defaultRuntime = previous
  }
})

test("parallel step respects ordinary BaseSolver iteration limits", () => {
  class Endless extends SquaresSolver {
    protected override getNextBatch() {
      return {
        inputs: [1],
        shared: { offset: 0 },
        runTask: (value: number) => value,
      }
    }
    protected override commitBatch(): boolean {
      return false
    }
  }
  const solver = new Endless([])
  solver.MAX_ITERATIONS = 3
  solver.solve()
  expect(solver.failed).toBe(true)
  expect(solver.iterations).toBe(3)
  expect(solver.error).toContain("ran out of iterations")
})

test("the new public entrypoint bundles for browsers without Node externals", async () => {
  const result = await Bun.build({
    entrypoints: [new URL("../lib/index.ts", import.meta.url).pathname],
    target: "browser",
    external: ["graphics-debug"],
  })
  expect(result.success).toBe(true)
})

test("browser-mode stepping completes synchronously through the same hooks", async () => {
  const entry = new URL("../lib/index.ts", import.meta.url).href
  const script = `
    const write = Bun.write.bind(Bun, Bun.stdout)
    Object.defineProperty(globalThis, "process", { value: undefined, configurable: true })
    const { ParallelSolver } = await import(${JSON.stringify(entry)})
    class Example extends ParallelSolver {
      output = []
      getNextBatch() { return { inputs: [4, 2], shared: undefined, runTask: value => value * value } }
      commitBatch(outputs) { this.output = outputs; return true }
    }
    const solver = new Example()
    const returned = solver.step()
    await write(JSON.stringify({ synchronous: returned === undefined, output: solver.output, solved: solver.solved, iterations: solver.iterations }))
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
    synchronous: true,
    output: [16, 4],
    solved: true,
    iterations: 1,
  })
})
