import { expect, test } from "bun:test"
import { getActiveSubSolverTree } from "../lib/react/PipelineStagesTable"
import { BaseSolver } from "../lib/BaseSolver"

class LeafSolver extends BaseSolver {
  override _step() {}
}

class NestedSolver extends BaseSolver {
  constructor(child?: BaseSolver) {
    super()
    this.activeSubSolver = child
  }

  override _step() {}
}

test("getActiveSubSolverTree returns the full nested active sub-solver chain", () => {
  const leaf = new LeafSolver()
  leaf.iterations = 2

  const middle = new NestedSolver(leaf)
  middle.solved = true

  const root = new NestedSolver(middle)

  expect(getActiveSubSolverTree(root, "stageOne")).toEqual([
    {
      id: "stageOne.NestedSolver",
      name: "NestedSolver",
      status: "Completed",
      children: [
        {
          id: "stageOne.NestedSolver.LeafSolver",
          name: "LeafSolver",
          status: "In Progress",
          children: [],
        },
      ],
    },
  ])
})

test("getActiveSubSolverTree returns an empty list when no active sub-solver exists", () => {
  expect(getActiveSubSolverTree(new LeafSolver(), "stageTwo")).toEqual([])
})
