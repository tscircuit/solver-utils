import { afterEach, expect, test } from "bun:test"
import { act } from "react"
import { BaseSolver } from "../lib/BaseSolver"
import { useSolverActions } from "../lib/react/useSolverActions"
import { cleanupReactRoot, mount } from "./fixtures/reactTestRoot"

afterEach(cleanupReactRoot)

test("the action guard rejects immediate duplicate actions and stops loops after unmount", async () => {
  const gate = Promise.withResolvers<void>()
  class ExternalSolver extends BaseSolver {
    override async _stepAsync() {
      await gate.promise
    }
  }
  const solver = new ExternalSolver()
  let run!: ReturnType<typeof useSolverActions>["run"]
  function Controls() {
    const actions = useSolverActions(solver)
    run = actions.run
    return <div>{actions.isRunning ? "Running" : "Idle"}</div>
  }
  const ui = await mount(<Controls />)
  let pending!: Promise<void>
  await act(() => {
    pending = run(async (step) => {
      while (!solver.solved) await step()
    })
    void run(async (step) => {
      await step()
    })
  })
  expect(solver.iterations).toBe(1)
  expect(ui.container.textContent).toBe("Running")
  await cleanupReactRoot()
  gate.resolve()
  await pending
  expect(solver.iterations).toBe(1)
  expect(solver.failed).toBe(false)
})
