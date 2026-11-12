import { afterEach, expect, test } from "bun:test"
import { act } from "react"
import { BaseSolver } from "../lib/BaseSolver"
import {
  BasePipelineSolver,
  definePipelineStep,
} from "../lib/BasePipelineSolver"
import { GenericSolverDebugger } from "../lib/react/GenericSolverDebugger"
import { cleanupReactRoot, mount, waitFor } from "./fixtures/reactTestRoot"

afterEach(cleanupReactRoot)

test("Solve renders pending work, guards every debugger control, and completes once", async () => {
  const gate = Promise.withResolvers<void>()
  class ExternalSolver extends BaseSolver {
    running = false
    override async _stepAsync() {
      this.running = true
      await gate.promise
      this.running = false
      this.solved = true
    }
  }
  class Pipeline extends BasePipelineSolver<undefined> {
    pipelineDef = [
      definePipelineStep("external", ExternalSolver, () => [undefined]),
    ]
    override getConstructorParams() {
      return []
    }
  }
  const solver = new Pipeline(undefined)
  let starts = 0
  let completions = 0
  const ui = await mount(
    <GenericSolverDebugger
      solver={solver}
      onSolverStarted={() => {
        starts++
      }}
      onSolverCompleted={() => {
        completions++
      }}
      customRenderer={{
        name: "Test",
        render: () => (
          <div>
            {solver.activeSubSolver &&
            (solver.activeSubSolver as ExternalSolver).running
              ? "External work running"
              : "Idle"}
          </div>
        ),
        getDownload: () => ({}),
      }}
    />,
  )
  await ui.click("Solve")
  expect(ui.container.textContent).toContain("External work running")
  expect(ui.container.querySelector('[role="status"]')?.textContent).toBe(
    "Running",
  )
  for (const label of [
    "Step",
    "Solve",
    "Animate",
    "Next Stage",
    "Next Solver",
    "Step Until Iteration",
  ]) {
    expect(ui.button(label).disabled).toBe(true)
  }
  await ui.click("Next Stage")
  expect(solver.iterations).toBe(2)
  await act(async () => {
    gate.resolve()
    await gate.promise
  })
  await waitFor(() => solver.solved)
  expect(starts).toBe(1)
  expect(completions).toBe(1)
  expect(solver.timeToSolve).toBeGreaterThanOrEqual(0)
  expect(ui.container.querySelector('[role="status"]')).toBeNull()
})
