import { expect, test } from "bun:test"
import { BaseSolver } from "../lib/BaseSolver"

test("an explicit failure at the iteration limit keeps its error and skips acceptance", () => {
  class FailedSolver extends BaseSolver {
    override MAX_ITERATIONS = 1
    acceptanceCalls = 0

    override _step() {
      this.error = "No feasible route"
      this.failed = true
    }

    override tryFinalAcceptance() {
      this.acceptanceCalls++
      this.solved = true
    }
  }
  const solver = new FailedSolver()
  solver.solve()

  expect(solver.failed).toBe(true)
  expect(solver.solved).toBe(false)
  expect(solver.acceptanceCalls).toBe(0)
  expect(solver.error).toBe("No feasible route")
})

test("an explicit failure is not replaced by an iteration exhaustion error", () => {
  class FailedSolver extends BaseSolver {
    override MAX_ITERATIONS = 1

    override _step() {
      this.error = "Invalid geometry"
      this.failed = true
    }
  }
  const solver = new FailedSolver()
  solver.solve()

  expect(solver.error).toBe("Invalid geometry")
  expect(solver.failed).toBe(true)
  expect(solver.solved).toBe(false)
})

test("a failure reported by final acceptance keeps its specific error", () => {
  class RejectedSolver extends BaseSolver {
    override MAX_ITERATIONS = 1

    override tryFinalAcceptance() {
      this.error = "Candidate violates clearance"
      this.failed = true
    }
  }
  const solver = new RejectedSolver()
  solver.solve()

  expect(solver.error).toBe("Candidate violates clearance")
  expect(solver.failed).toBe(true)
  expect(solver.solved).toBe(false)
})

test("an unfinished solver can still accept a solution at the iteration limit", () => {
  class AcceptedSolver extends BaseSolver {
    override MAX_ITERATIONS = 1

    override tryFinalAcceptance() {
      this.solved = true
    }
  }
  const solver = new AcceptedSolver()
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  expect(solver.error).toBeNull()
})
