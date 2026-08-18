import { describe, expect, test } from "bun:test"
import { BasePipelineSolver } from "../lib/BasePipelineSolver"
import { BaseSolver } from "../lib/BaseSolver"
import { getDisplayedStages } from "../lib/react/PipelineStagesTable"

class LeafSolver extends BaseSolver {
  constructor(
    public label: string,
    iterations = 0,
    progress = 0,
  ) {
    super()
    this.iterations = iterations
    this.progress = progress
  }

  override getSolverName(): string {
    return this.label
  }
}

class NestedSolver extends BaseSolver {
  constructor(activeSubSolver?: BaseSolver | null) {
    super()
    this.activeSubSolver = activeSubSolver ?? null
  }
}

class FirstStageSolver extends BaseSolver {}
class SecondStageSolver extends BaseSolver {}

class ExamplePipelineSolver extends BasePipelineSolver<any> {
  pipelineDef = [
    {
      solverName: "firstStage",
      solverClass: FirstStageSolver,
      getConstructorParams: () => [],
    },
    {
      solverName: "secondStage",
      solverClass: SecondStageSolver,
      getConstructorParams: () => [],
    },
  ]
}

describe("getDisplayedStages", () => {
  test("returns pipeline stage metadata for pipeline solvers", () => {
    const solver = new ExamplePipelineSolver({})
    solver.currentPipelineStageIndex = 1
    solver.iterations = 12
    solver.firstIterationOfStage = {
      firstStage: 0,
      secondStage: 6,
    }
    solver.timeSpentOnStage = {
      firstStage: 1500,
      secondStage: 250,
    }
    ;(solver as any).secondStage = Object.assign(new SecondStageSolver(), {
      progress: 0.5,
      stats: { attempts: 2 },
    })
    solver.activeSubSolver = (solver as any).secondStage

    expect(getDisplayedStages(solver)).toEqual([
      {
        index: 0,
        name: "firstStage",
        status: "Completed",
        firstIteration: 0,
        iterations: 6,
        progress: 1,
        timeSpent: 1500,
        stats: null,
        solverInstance: null,
      },
      {
        index: 1,
        name: "secondStage",
        status: "In Progress",
        firstIteration: 6,
        iterations: 6,
        progress: 0.5,
        timeSpent: 250,
        stats: { attempts: 2 },
        solverInstance: (solver as any).secondStage,
      },
    ])
  })

  test("returns the active subsolver as a single expandable row for non-pipeline solvers", () => {
    const grandChild = new LeafSolver("GrandChildSolver", 7, 0.8)
    grandChild.stats = { score: 42 }
    grandChild.timeToSolve = 900

    const child = new LeafSolver("ChildSolver", 3, 0.25)
    child.activeSubSolver = grandChild
    child.stats = { branch: "A" }

    const solver = new NestedSolver(child)

    expect(getDisplayedStages(solver)).toEqual([
      {
        index: null,
        name: "ChildSolver",
        status: "In Progress",
        firstIteration: null,
        iterations: 3,
        progress: 0.25,
        timeSpent: 0,
        stats: { branch: "A" },
        solverInstance: child,
      },
    ])
  })

  test("marks solved and failed subsolvers with the matching display status", () => {
    const solvedSubSolver = new LeafSolver("Solved")
    solvedSubSolver.solved = true

    const failedSubSolver = new LeafSolver("Failed")
    failedSubSolver.failed = true

    expect(
      getDisplayedStages(new NestedSolver(solvedSubSolver))[0]?.status,
    ).toBe("Completed")
    expect(
      getDisplayedStages(new NestedSolver(failedSubSolver))[0]?.status,
    ).toBe("Failed")
  })
})
