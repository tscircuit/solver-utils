import { expect, test } from "bun:test"
import { BasePipelineSolver } from "../lib/BasePipelineSolver"
import { BaseSolver } from "../lib/BaseSolver"
import { getDisplayedStages } from "../lib/react/PipelineStagesTable"

class FailingSolver extends BaseSolver {
  override _step() {
    this.failed = true
    this.error = "No route found"
  }
}

class FailurePipeline extends BasePipelineSolver<null> {
  pipelineDef = [
    {
      solverName: "route",
      solverClass: FailingSolver,
      getConstructorParams: () => [],
    },
    {
      solverName: "next",
      solverClass: BaseSolver,
      getConstructorParams: () => [],
    },
  ]
}

test("a failed pipeline stage remains Failed after the active solver is cleared", () => {
  const pipeline = new FailurePipeline(null)
  pipeline.solve()

  expect(pipeline.failed).toBe(true)
  expect(pipeline.activeSubSolver).toBeNull()
  expect(getDisplayedStages(pipeline).map((stage) => stage.status)).toEqual([
    "Failed",
    "Not Started",
  ])
})

test("a stage that fails during construction is displayed as Failed", () => {
  class InvalidSolver extends BaseSolver {
    constructor() {
      super()
      throw new Error("Invalid input")
    }
  }
  class InvalidPipeline extends BasePipelineSolver<null> {
    pipelineDef = [
      {
        solverName: "invalid",
        solverClass: InvalidSolver,
        getConstructorParams: () => [],
      },
    ]
  }
  const pipeline = new InvalidPipeline(null)
  expect(() => pipeline.step()).toThrow("Invalid input")
  expect(getDisplayedStages(pipeline)[0]?.status).toBe("Failed")
})

test("a stage transitions from Not Started to In Progress before failure", () => {
  const pipeline = new FailurePipeline(null)
  expect(getDisplayedStages(pipeline)[0]?.status).toBe("Not Started")
  pipeline.step()
  expect(getDisplayedStages(pipeline)[0]?.status).toBe("In Progress")
})
