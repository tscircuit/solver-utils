import { expect, test } from "bun:test"
import { SolverRuntime } from "../../lib"
import { createTestRuntimes } from "../fixtures/createTestRuntimes"
import { ParentSolver, SumSolver } from "../fixtures/runtimeSolvers"

test("sync solvers, async orchestration, and nested workers preserve serial output", async (): Promise<void> => {
  const input = {
    groups: [
      [1, 2],
      [3, 4],
      [5, 6],
    ],
  }
  const serial = new ParentSolver(input)
  serial.solve()
  for (const runtime of createTestRuntimes()) {
    try {
      expect(await runtime.executeAsync("ParentSolver", input)).toEqual(
        serial.getOutput(),
      )
      expect(await runtime.executeAsync(ParentSolver, input)).toEqual(
        serial.getOutput(),
      )
      const byName = await runtime.executeAsync("SumSolver", {
        values: [20, 22],
      })
      const byClass = await runtime.executeAsync(SumSolver, {
        values: [20, 22],
      })
      expect(byClass).toEqual(byName)
      const parent = new ParentSolver(input)
      await parent.solveAsync(runtime)
      expect(parent.getOutput()).toEqual(serial.getOutput())
    } finally {
      await runtime.dispose()
    }
  }
  const runtime = new SolverRuntime()
  try {
    expect(
      await runtime.executeAsync("SumSolver", { values: [20, 22] }),
    ).toEqual({ sum: 42, worker: false })
  } finally {
    await runtime.dispose()
  }
})
