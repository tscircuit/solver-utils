import { afterEach, describe, expect, test } from "bun:test"
import { act, createElement } from "react"
import { BasePipelineSolver } from "../lib/BasePipelineSolver"
import { BaseSolver } from "../lib/BaseSolver"
import {
  getDisplayedStages,
  PipelineStagesTable,
} from "../lib/react/PipelineStagesTable"
import { cleanupReactRoot, mount, waitFor } from "./fixtures/reactTestRoot"

afterEach(cleanupReactRoot)

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

test("Next Stage awaits the current stage before instantiating the next", async () => {
  const gate = Promise.withResolvers<void>()
  class External extends BaseSolver {
    override async _stepAsync() {
      await gate.promise
      this.solved = true
    }
  }
  const pipeline = new ExamplePipelineSolver({})
  pipeline.pipelineDef[0]!.solverClass = External
  const ui = await mount(
    createElement(PipelineStagesTable, { solver: pipeline }),
  )
  await ui.click("Next Stage") // Instantiate the first stage, as before.
  expect(pipeline.activeSubSolver).toBeInstanceOf(External)
  await ui.click("Next Stage")
  expect(ui.button("Next Solver").disabled).toBe(true)
  expect(ui.container.textContent).toContain("Running")
  await act(async () => {
    gate.resolve()
    await gate.promise
  })
  await waitFor(() => !ui.button("Next Stage").disabled)
  expect(pipeline.activeSubSolver).toBeInstanceOf(SecondStageSolver)
  expect(pipeline.currentPipelineStageIndex).toBe(1)
})

test("nested stage play advances through the root pipeline and updates stage bookkeeping", async () => {
  class Done extends BaseSolver {
    override async _stepAsync() {
      await Promise.resolve()
      this.solved = true
    }
  }
  class Inner extends BasePipelineSolver<undefined> {
    pipelineDef = [
      { solverName: "leaf", solverClass: Done, getConstructorParams: () => [] },
    ]
  }
  class Outer extends BasePipelineSolver<undefined> {
    pipelineDef = [
      {
        solverName: "inner",
        solverClass: Inner,
        getConstructorParams: () => [undefined],
      },
    ]
  }
  const solver = new Outer(undefined)
  await solver.stepAsync()
  const ui = await mount(createElement(PipelineStagesTable, { solver }))
  const expand = ui.container.querySelector('button[title="Expand"]')!
  await act(() => {
    ;(expand as unknown as HTMLButtonElement).click()
  })
  const play = ui.container.querySelector(
    'button[title="Step until leaf completes"]',
  )!
  await act(() => {
    ;(play as unknown as HTMLButtonElement).click()
  })
  await waitFor(
    () => solver.getSolver<Inner>("inner")!.currentPipelineStageIndex === 1,
  )
  expect(solver.iterations).toBe(3)
  expect(
    solver.getSolver<Inner>("inner")!.timeSpentOnStage.leaf,
  ).toBeGreaterThanOrEqual(0)
})
