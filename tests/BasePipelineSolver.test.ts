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
  expect(pipeline.currentPipelineStepIndex).toBe(0)
  expect(pipeline.getCurrentPhase()).toBe("stepOneSolver")
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
  expect(pipeline.getCurrentPhase()).toBe("stepOneSolver")

  // Continue until first step is done
  while (pipeline.getCurrentPhase() === "stepOneSolver" && !pipeline.failed) {
    pipeline.step()
  }

  expect(pipeline.getSolver<StepOneSolver>("stepOneSolver")!.solved).toBe(true)
  expect(
    pipeline.getSolver<StepOneSolver>("stepOneSolver")!.result,
  ).toBeGreaterThanOrEqual(10)
  expect(pipeline.getCurrentPhase()).toBe("stepTwoSolver")

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
  expect(pipeline.getCurrentPhase()).toBe("none")
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
  pipeline.solveUntilPhase("stepTwoSolver")

  expect(pipeline.getCurrentPhase()).toBe("stepTwoSolver")
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
  expect(pipeline.getPhaseProgress()).toBe(0)

  // Solve first phase
  pipeline.solveUntilPhase("stepTwoSolver")

  // Progress should be around 1/3 (first phase complete, second phase starting)
  const progressAfterPhase1 = pipeline.getPhaseProgress()
  expect(progressAfterPhase1).toBeGreaterThan(0.3)
  expect(progressAfterPhase1).toBeLessThan(0.7)

  // Complete the pipeline
  pipeline.solve()
  expect(pipeline.getPhaseProgress()).toBe(1)
})

test("BasePipelineSolver phase statistics", () => {
  const input: TestInputProblem = {
    targetValue: 20,
    initialValue: 0,
  }

  const pipeline = new TestPipelineSolver(input)
  pipeline.solve()

  const stats = pipeline.getPhaseStats()

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
