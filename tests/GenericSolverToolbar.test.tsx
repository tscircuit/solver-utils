import { afterEach, expect, test } from "bun:test"
import { act } from "react"
import { BaseSolver } from "../lib/BaseSolver"
import { GenericSolverToolbar } from "../lib/react/GenericSolverToolbar"
import { cleanupReactRoot, mount, waitFor } from "./fixtures/reactTestRoot"

afterEach(cleanupReactRoot)

const toolbar = (solver: BaseSolver) => (
  <GenericSolverToolbar
    solver={solver}
    triggerRender={() => {}}
    renderer="vector"
    onRendererChange={() => {}}
    onAnimationSpeedChange={() => {}}
    onDownloadVisualization={() => {}}
    animationSpeed={1}
  />
)

test("Step awaits external work, disables controls and displays rejection", async () => {
  const gate = Promise.withResolvers<void>()
  class ExternalSolver extends BaseSolver {
    override async _stepAsync() {
      await gate.promise
    }
    override getConstructorParams() {
      return []
    }
  }
  const solver = new ExternalSolver()
  const ui = await mount(toolbar(solver))
  await ui.click("Step")
  await ui.click("Step")
  expect(solver.iterations).toBe(1)
  expect(ui.button("Solve").disabled).toBe(true)
  await act(async () => {
    gate.reject(new Error("native failure"))
    await Promise.resolve()
  })
  expect(solver.failed).toBe(true)
  expect(ui.container.textContent).toContain("native failure")
  expect(ui.container.querySelector('[role="status"]')).toBeNull()
})

test("Animate waits for the previous tick and Stop prevents the next external request", async () => {
  const gates = [Promise.withResolvers<void>(), Promise.withResolvers<void>()]
  let requests = 0
  class ExternalSolver extends BaseSolver {
    override async _stepAsync() {
      await gates[requests++]!.promise
    }
    override getConstructorParams() {
      return []
    }
  }
  const solver = new ExternalSolver()
  const ui = await mount(toolbar(solver))
  await ui.click("Animate")
  await waitFor(() => requests === 1)
  await act(async () => {
    await Bun.sleep(10)
  })
  expect(requests).toBe(1)
  expect(ui.button("Stop").disabled).toBe(false)
  await act(async () => {
    gates[0]!.resolve()
    await Promise.resolve()
  })
  await waitFor(() => requests === 2)
  await ui.click("Stop")
  expect(ui.button("Step").disabled).toBe(true) // The pending request still owns the guard.
  await act(async () => {
    gates[1]!.resolve()
    await Promise.resolve()
  })
  await waitFor(() => !ui.button("Step").disabled)
  expect(requests).toBe(2)
  expect(solver.iterations).toBe(2)
})

test("Step Until Iteration uses async steps and retains synchronous solver results", async () => {
  class Counter extends BaseSolver {
    value = 0
    override _step() {
      if (++this.value === 3) this.solved = true
    }
    override getConstructorParams() {
      return []
    }
  }
  const solver = new Counter()
  const ui = await mount(toolbar(solver))
  Object.assign(ui.window, { prompt: () => "2" })
  await ui.click("Step Until Iteration")
  expect(solver.iterations).toBe(2)
  expect(solver.value).toBe(2)
  await ui.click("Solve")
  expect(solver.solved).toBe(true)
  expect(solver.iterations).toBe(3)
})
