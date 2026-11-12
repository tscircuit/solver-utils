import { test, expect } from "bun:test"
import {
  BasePipelineSolver,
  definePipelineStep,
} from "../lib/BasePipelineSolver"
import { BaseSolver } from "../lib/BaseSolver"
import type { GraphicsObject } from "graphics-debug"

interface TestInputProblem {
  targetValue: number
  initialValue: number
}

class StepOneSolver extends BaseSolver {
  result: number

  constructor(private input: TestInputProblem) {
    super()
    this.result = input.initialValue
  }

  override _step() {
    this.result += 1
    if (this.result >= this.input.targetValue / 2) {
      this.solved = true
    }
  }

  override visualize(): GraphicsObject {
    return {
      points: [{ x: this.result, y: 0, label: "Step1" }],
      lines: [],
      rects: [],
      circles: [],
    }
  }
}

class StepTwoSolver extends BaseSolver {
  result: number
  target: number

  constructor({
    startValue,
    target,
  }: {
    startValue: number
    target: number
  }) {
    super()
    this.target = target
    this.result = startValue
  }

  override _step() {
    this.result += 2
    if (this.result >= this.target) {
      this.solved = true
    }
  }

  override visualize(): GraphicsObject {
    return {
      points: [{ x: this.result, y: 1, label: "Step2" }],
      lines: [],
      rects: [],
      circles: [],
    }
  }
}

class StepThreeSolver extends BaseSolver {
  result: number

  constructor(private startValue: number) {
    super()
    this.result = startValue
  }

  override _step() {
    this.result *= 1.1
    if (this.result >= 100) {
      this.solved = true
    }
  }

  override visualize(): GraphicsObject {
    return {
      points: [{ x: this.result, y: 2, label: "Step3" }],
      lines: [],
      rects: [],
      circles: [],
    }
  }
}

class TestPipelineSolver extends BasePipelineSolver<TestInputProblem> {
  stepOneSolver?: StepOneSolver
  stepTwoSolver?: StepTwoSolver
  stepThreeSolver?: StepThreeSolver

  finalResult = 0

  pipelineDef = [
    definePipelineStep(
      "stepOneSolver",
      StepOneSolver,
      (instance) => [instance.inputProblem],
      {
        onSolved: (instance) => {
          console.log(
            `Step 1 completed with result: ${instance.getSolver<StepOneSolver>("stepOneSolver")!.result}`,
          )
        },
      },
    ),
    definePipelineStep(
      "stepTwoSolver",
      StepTwoSolver,
      (instance) => [
        {
          startValue:
            instance.getSolver<StepOneSolver>("stepOneSolver")!.result,
          target: instance.inputProblem.targetValue,
        },
      ],
      {
        onSolved: (instance) => {
          console.log(
            `Step 2 completed with result: ${instance.getSolver<StepTwoSolver>("stepTwoSolver")!.result}`,
          )
        },
      },
    ),
    definePipelineStep(
      "stepThreeSolver",
      StepThreeSolver,
      (instance) => [
        instance.getSolver<StepTwoSolver>("stepTwoSolver")!.result,
      ],
      {
        onSolved: (instance) => {
          ;(instance as any).finalResult =
            instance.getSolver<StepThreeSolver>("stepThreeSolver")!.result
          console.log(
            `Pipeline completed with final result: ${(instance as any).finalResult}`,
          )
        },
      },
    ),
  ]

  override getConstructorParams() {
    return [this.inputProblem]
  }
}

test("BasePipelineSolver extension basic functionality", () => {
  const input: TestInputProblem = {
    targetValue: 20,
    initialValue: 0,
  }

  const pipeline = new TestPipelineSolver(input)

  expect(pipeline.solved).toBe(false)
  expect(pipeline.failed).toBe(false)
  expect(pipeline.currentPipelineStageIndex).toBe(0)
  expect(pipeline.getCurrentStageName()).toBe("stepOneSolver")
  expect(pipeline.inputProblem).toEqual(input)
})

test("BasePipelineSolver step-by-step execution", () => {
  const input: TestInputProblem = {
    targetValue: 20,
    initialValue: 0,
  }

  const pipeline = new TestPipelineSolver(input)

  // Initially no active sub-solver
  expect(pipeline.activeSubSolver).toBeFalsy()

  // First step should create the first solver
  pipeline.step()
  expect(pipeline.activeSubSolver).toBeInstanceOf(StepOneSolver)
  expect(pipeline.getSolver<StepOneSolver>("stepOneSolver")).toBeInstanceOf(
    StepOneSolver,
  )
  expect(pipeline.getCurrentStageName()).toBe("stepOneSolver")

  // Continue until first step is done
  while (
    pipeline.getCurrentStageName() === "stepOneSolver" &&
    !pipeline.failed
  ) {
    pipeline.step()
  }

  expect(pipeline.getSolver<StepOneSolver>("stepOneSolver")!.solved).toBe(true)
  expect(
    pipeline.getSolver<StepOneSolver>("stepOneSolver")!.result,
  ).toBeGreaterThanOrEqual(10)
  expect(pipeline.getCurrentStageName()).toBe("stepTwoSolver")

  // Take one more step to instantiate the second solver
  pipeline.step()
  expect(pipeline.getSolver<StepTwoSolver>("stepTwoSolver")).toBeInstanceOf(
    StepTwoSolver,
  )
})

test("BasePipelineSolver full pipeline execution", () => {
  const input: TestInputProblem = {
    targetValue: 20,
    initialValue: 0,
  }

  const pipeline = new TestPipelineSolver(input)
  pipeline.solve()

  expect(pipeline.solved).toBe(true)
  expect(pipeline.failed).toBe(false)
  expect(pipeline.getCurrentStageName()).toBe("none")
  expect((pipeline as any).finalResult).toBeGreaterThan(0)

  // All sub-solvers should be solved (using type-safe accessor)
  expect(pipeline.getSolver<StepOneSolver>("stepOneSolver")!.solved).toBe(true)
  expect(pipeline.getSolver<StepTwoSolver>("stepTwoSolver")!.solved).toBe(true)
  expect(pipeline.getSolver<StepThreeSolver>("stepThreeSolver")!.solved).toBe(
    true,
  )
})

test("BasePipelineSolver solveUntilPhase", () => {
  const input: TestInputProblem = {
    targetValue: 20,
    initialValue: 0,
  }

  const pipeline = new TestPipelineSolver(input)

  // Solve until step 2
  pipeline.solveUntilStage("stepTwoSolver")

  expect(pipeline.getCurrentStageName()).toBe("stepTwoSolver")
  expect(pipeline.getSolver<StepOneSolver>("stepOneSolver")!.solved).toBe(true)
  expect(pipeline.getSolver("stepThreeSolver")).toBeUndefined()
  expect(pipeline.solved).toBe(false)

  // Take one step to instantiate the second solver
  pipeline.step()
  expect(pipeline.getSolver<StepTwoSolver>("stepTwoSolver")).toBeInstanceOf(
    StepTwoSolver,
  )
})

test("BasePipelineSolver phase progress tracking", () => {
  const input: TestInputProblem = {
    targetValue: 20,
    initialValue: 0,
  }

  const pipeline = new TestPipelineSolver(input)

  // Initial progress should be 0
  expect(pipeline.getStageProgress()).toBe(0)

  // Solve first phase
  pipeline.solveUntilStage("stepTwoSolver")

  // Progress should be around 1/3 (first phase complete, second phase starting)
  const progressAfterPhase1 = pipeline.getStageProgress()
  expect(progressAfterPhase1).toBeGreaterThan(0.3)
  expect(progressAfterPhase1).toBeLessThan(0.7)

  // Complete the pipeline
  pipeline.solve()
  expect(pipeline.getStageProgress()).toBe(1)
})

test("BasePipelineSolver phase statistics", () => {
  const input: TestInputProblem = {
    targetValue: 20,
    initialValue: 0,
  }

  const pipeline = new TestPipelineSolver(input)
  pipeline.solve()

  const stats = pipeline.getStageStats()

  expect(stats).toHaveProperty("stepOneSolver")
  expect(stats).toHaveProperty("stepTwoSolver")
  expect(stats).toHaveProperty("stepThreeSolver")

  expect(stats.stepOneSolver?.completed).toBe(true)
  expect(stats.stepTwoSolver?.completed).toBe(true)
  expect(stats.stepThreeSolver?.completed).toBe(true)

  expect(stats.stepOneSolver?.timeSpent).toBeGreaterThan(0)
  expect(stats.stepTwoSolver?.timeSpent).toBeGreaterThan(0)
  expect(stats.stepThreeSolver?.timeSpent).toBeGreaterThan(0)
})

test("BasePipelineSolver visualization", () => {
  const input: TestInputProblem = {
    targetValue: 20,
    initialValue: 0,
  }

  const pipeline = new TestPipelineSolver(input)
  pipeline.solve()

  const viz = pipeline.visualize()

  expect(viz.points).toBeDefined()
  expect(viz.points!.length).toBeGreaterThan(0)

  // Should have points from all three solvers
  const step0Points = viz.points!.filter((p) => p.step === 0)
  const step1Points = viz.points!.filter((p) => p.step === 1)
  const step2Points = viz.points!.filter((p) => p.step === 2)

  expect(step0Points.length).toBeGreaterThan(0)
  expect(step1Points.length).toBeGreaterThan(0)
  expect(step2Points.length).toBeGreaterThan(0)
})

test("BasePipelineSolver error handling", () => {
  class FailingSolver extends BaseSolver {
    constructor(_params?: any) {
      super()
    }

    override _step() {
      throw new Error("Intentional test error")
    }
  }

  class FailingPipelineSolver extends BasePipelineSolver<TestInputProblem> {
    failingSolver?: FailingSolver

    pipelineDef = [
      definePipelineStep("failingSolver", FailingSolver, () => [undefined]),
    ]

    override getConstructorParams() {
      return [this.inputProblem]
    }
  }

  const input: TestInputProblem = { targetValue: 20, initialValue: 0 }
  const pipeline = new FailingPipelineSolver(input)

  expect(() => pipeline.solve()).toThrow("Intentional test error")
  expect(pipeline.failed).toBe(true)
  expect(pipeline.error).toContain("FailingPipelineSolver error")
})

test("BasePipelineSolver preview method", () => {
  const input: TestInputProblem = {
    targetValue: 20,
    initialValue: 0,
  }

  const pipeline = new TestPipelineSolver(input)

  // Take one step to start the first solver
  pipeline.step()

  const preview = pipeline.preview()
  expect(preview).toBeDefined()

  // Should delegate to active sub-solver's preview
  expect(pipeline.activeSubSolver).toBeTruthy()
})

test("async runs preserve synchronous pipeline steps, callbacks, outputs and visuals", async () => {
  const input = { targetValue: 20, initialValue: 0 }
  const sync = new TestPipelineSolver(input)
  const async = new TestPipelineSolver(input)
  sync.solve()
  await async.solveAsync()
  expect(async.solved).toBe(true)
  expect(async.iterations).toBe(sync.iterations)
  expect(async.finalResult).toBe(sync.finalResult)
  expect(async.progress).toBe(sync.progress)
  expect(async.firstIterationOfStage).toEqual(sync.firstIterationOfStage)
  expect(async.getAllOutputs()).toEqual(sync.getAllOutputs())
  expect(async.visualize()).toEqual(sync.visualize())
})

test("async runs retain custom synchronous pipeline hooks", async () => {
  class CustomPipeline extends TestPipelineSolver {
    hookCalls = 0
    override _step() {
      this.hookCalls++
      super._step()
    }
  }
  const solver = new CustomPipeline({ targetValue: 20, initialValue: 0 })
  await solver.solveAsync()
  expect(solver.solved).toBe(true)
  expect(solver.hookCalls).toBe(solver.iterations)
})

class ExternalSolver extends BaseSolver {
  constructor(private result: Promise<number>) {
    super()
  }
  value = 0
  override async _stepAsync() {
    this.value = await this.result
    this.solved = true
  }
  override getOutput() {
    return this.value
  }
}

class AsyncPipeline extends BasePipelineSolver<Promise<number>> {
  completed = 0
  pipelineDef = [
    definePipelineStep(
      "external",
      ExternalSolver,
      (pipeline) => [pipeline.inputProblem],
      {
        onSolved: (pipeline) => {
          ;(pipeline as AsyncPipeline).completed++
        },
      },
    ),
    definePipelineStep("sync", StepThreeSolver, (pipeline) => [
      pipeline.getStageOutput<number>("external")!,
    ]),
  ]
  override getOutput() {
    return this.getAllOutputs()
  }
}

test("pipeline awaits an external stage and captures timing/output only on completion", async () => {
  const gate = Promise.withResolvers<number>()
  const pipeline = new AsyncPipeline(gate.promise)
  await pipeline.stepAsync() // Instantiate, as in the sync lifecycle.
  const pending = pipeline.stepAsync()
  expect(pipeline.getCurrentStageName()).toBe("external")
  expect(pipeline.hasStageOutput("external")).toBe(false)
  expect(pipeline.endTimeOfStage.external).toBeUndefined()
  await expect(pipeline.stepAsync()).rejects.toThrow("step in flight")
  gate.resolve(100)
  await pending
  expect(pipeline.getStageOutput("external")).toBe(100)
  expect(pipeline.completed).toBe(1)
  expect(pipeline.timeSpentOnStage.external).toBeGreaterThanOrEqual(0)
  expect(pipeline.endTimeOfStage.external).toBeGreaterThanOrEqual(
    pipeline.startTimeOfStage.external!,
  )
  await pipeline.solveAsync()
  expect(pipeline.solved).toBe(true)
  expect(pipeline.getSolver("sync")!.iterations).toBe(1)
})

test("solveUntilStageAsync matches the sync stop-before-stage and case-insensitive lookup", async () => {
  const pipeline = new AsyncPipeline(Promise.resolve(100))
  await pipeline.solveUntilStageAsync("SyNc")
  expect(pipeline.getCurrentStageName()).toBe("sync")
  expect(pipeline.getSolver("sync")).toBeUndefined()
  expect(pipeline.getStageOutput("external")).toBe(100)
  await pipeline.solveUntilStageAsync("missing")
  expect(pipeline.solved).toBe(true)
  await pipeline.solveUntilStageAsync("external") // No loop after completion.
})

test("sync pipeline calls reaching an async stage fail explicitly, far before MAX_ITERATIONS", () => {
  const pipeline = new AsyncPipeline(Promise.resolve(100))
  expect(() => pipeline.solve()).toThrow("requires stepAsync() or solveAsync()")
  expect(pipeline.failed).toBe(true)
  expect(pipeline.iterations).toBe(2)
  expect(pipeline.activeSubSolver!.iterations).toBe(0)
})

test("nested pipelines await the same stage definitions and propagate rejection", async () => {
  class OuterPipeline extends BasePipelineSolver<Promise<number>> {
    pipelineDef = [
      definePipelineStep("inner", AsyncPipeline, (pipeline) => [
        pipeline.inputProblem,
      ]),
    ]
  }
  const pipeline = new OuterPipeline(Promise.resolve(100))
  await pipeline.solveAsync()
  expect(pipeline.solved).toBe(true)
  expect(pipeline.getStageOutput("inner")).toEqual({ external: 100 })
  expect(pipeline.getSolver<AsyncPipeline>("inner")!.completed).toBe(1)

  const gate = Promise.withResolvers<number>()
  const failing = new OuterPipeline(gate.promise)
  const pending = failing.solveAsync()
  gate.reject(new Error("ngspice rejected"))
  await expect(pending).rejects.toThrow("ngspice rejected")
  const inner = failing.getSolver<AsyncPipeline>("inner")!
  expect(failing.failed).toBe(true)
  expect(inner.failed).toBe(true)
  expect(inner.activeSubSolver!.failed).toBe(true)
  expect(failing.error).toContain("ngspice rejected")
  expect(failing.getAllOutputs()).toEqual({})
  expect(inner.getAllOutputs()).toEqual({})
})
