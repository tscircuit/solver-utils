import { describe, expect, test } from "bun:test"
import { BaseSolver } from "../lib/BaseSolver"
import { getSolverChain } from "../lib/react/SolverBreadcrumbInputDownloader"

class ChainSolver extends BaseSolver {
  override _step() {}

  override getConstructorParams() {
    return {}
  }
}

describe("getSolverChain", () => {
  test("returns the chain of active sub solvers", () => {
    const rootSolver = new ChainSolver()
    const childSolver = new ChainSolver()
    const grandChildSolver = new ChainSolver()

    rootSolver.activeSubSolver = childSolver
    childSolver.activeSubSolver = grandChildSolver

    const chain = getSolverChain(rootSolver)
    expect(chain).toEqual([rootSolver, childSolver, grandChildSolver])
  })

  test("guards against circular references", () => {
    const solverA = new ChainSolver()
    const solverB = new ChainSolver()

    solverA.activeSubSolver = solverB
    solverB.activeSubSolver = solverA

    const chain = getSolverChain(solverA)
    expect(chain).toEqual([solverA, solverB])
  })
})
