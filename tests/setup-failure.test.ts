import { test } from "bun:test"
import { strict as assert } from "node:assert"
import { BaseSolver } from "../lib/BaseSolver"

class SetupFailureSolver extends BaseSolver {
  setupCalls = 0
  stepCalls = 0
  setupError = new Error("invalid input during setup")

  override _setup() {
    this.setupCalls++
    throw this.setupError
  }

  override _step() {
    this.stepCalls++
  }
}

for (const method of ["step", "solve"] as const) {
  test(`${method} records setup failure and rethrows the original error`, () => {
    const solver = new SetupFailureSolver()
    assert.throws(() => solver[method](), (error) => error === solver.setupError)
    assert.equal(solver.failed, true)
    assert.equal(solver.solved, false)
    assert.equal(solver.iterations, 0)
    assert.equal(solver.stepCalls, 0)
    assert.equal(solver._setupDone, false)
    assert.equal(solver.error, `SetupFailureSolver error: ${solver.setupError}`)
  })
}

test("step does not retry setup after initialization has failed", () => {
  const solver = new SetupFailureSolver()
  assert.throws(() => solver.step())
  assert.doesNotThrow(() => solver.step())
  assert.equal(solver.setupCalls, 1)
  assert.equal(solver.stepCalls, 0)
})

for (const state of ["solved", "failed"] as const) {
  test(`step does not initialize an already ${state} solver`, () => {
    const solver = new SetupFailureSolver()
    solver[state] = true
    assert.doesNotThrow(() => solver.step())
    assert.equal(solver.setupCalls, 0)
    assert.equal(solver.iterations, 0)
  })

  test(`setup can mark a solver ${state} without running a step`, () => {
    class TerminalSetupSolver extends BaseSolver {
      override _setup() {
        this[state] = true
      }

      override _step() {
        assert.fail("a terminal solver must not perform work")
      }
    }
    const solver = new TerminalSetupSolver()
    solver.step()
    assert.equal(solver[state], true)
    assert.equal(solver._setupDone, true)
    assert.equal(solver.iterations, 0)
  })
}

test("successful initialization still runs once across multiple steps", () => {
  class SuccessfulSolver extends BaseSolver {
    setupCalls = 0
    override _setup() {
      this.setupCalls++
    }
    override _step() {
      this.solved = this.iterations === 2
    }
  }
  const solver = new SuccessfulSolver()
  solver.solve()
  assert.equal(solver.setupCalls, 1)
  assert.equal(solver.iterations, 2)
  assert.equal(solver.solved, true)
  assert.equal(solver.failed, false)
})

test("step exceptions retain their existing failure behavior", () => {
  const failure = new Error("step failure")
  class StepFailureSolver extends BaseSolver {
    override _step() {
      throw failure
    }
  }
  const solver = new StepFailureSolver()
  assert.throws(() => solver.step(), (error) => error === failure)
  assert.equal(solver.failed, true)
  assert.equal(solver.iterations, 1)
  assert.equal(solver.error, `StepFailureSolver error: ${failure}`)
})
