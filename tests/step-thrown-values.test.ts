import { test } from "bun:test"
import { strict as assert } from "node:assert"
import { BaseSolver } from "../lib/BaseSolver"

const fallbackMessage =
  "Solver error: thrown value could not be converted to a string"

const cases: Array<[string, () => unknown, string]> = [
  ["symbol", () => Symbol("failure"), "ThrowingSolver error: Symbol(failure)"],
  ["null prototype", () => Object.create(null), fallbackMessage],
  [
    "throwing conversion",
    () => ({
      [Symbol.toPrimitive]() {
        throw new Error("conversion failed")
      },
    }),
    fallbackMessage,
  ],
  [
    "revoked proxy",
    () => {
      const { proxy, revoke } = Proxy.revocable({}, {})
      revoke()
      return proxy
    },
    fallbackMessage,
  ],
  [
    "Error",
    () => new Error("original failure"),
    "ThrowingSolver error: Error: original failure",
  ],
  ["string", () => "original failure", "ThrowingSolver error: original failure"],
  ["null", () => null, "ThrowingSolver error: null"],
  ["undefined", () => undefined, "ThrowingSolver error: undefined"],
]

for (const method of ["step", "solve"] as const) {
  for (const [label, createFailure, expectedMessage] of cases) {
    test(`${method} preserves a thrown ${label} and stops the solver`, () => {
      const failure = createFailure()
      class ThrowingSolver extends BaseSolver {
        calls = 0

        override _step() {
          this.calls++
          throw failure
        }
      }
      const solver = new ThrowingSolver()
      assert.throws(
        () => solver[method](),
        (error) => error === failure,
      )
      assert.equal(solver.failed, true)
      assert.equal(solver.solved, false)
      assert.equal(solver.error, expectedMessage)
      assert.equal(solver.iterations, 1)
      assert.equal(solver.calls, 1)

      assert.doesNotThrow(() => solver.step())
      assert.doesNotThrow(() => solver.solve())
      assert.equal(solver.iterations, 1)
      assert.equal(solver.calls, 1)
      assert.equal(solver.error, expectedMessage)
    })
  }
}
