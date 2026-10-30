import { expect, test } from "bun:test"
import { SolverRuntime, type SolverRuntimeExecutor } from "../../lib"
import { createTestRuntimes } from "../fixtures/createTestRuntimes"
import "../fixtures/runtimeSolvers"

test("runtime advertises configured capacity before and after worker startup", async (): Promise<void> => {
  const runtimes = createTestRuntimes()
  runtimes.push(new SolverRuntime({ workerCount: 4 }))
  try {
    for (const [index, runtime] of runtimes.entries()) {
      const executor: SolverRuntimeExecutor = runtime
      const expected = index === 1 || index === 2 ? 2 : 1
      expect(executor.workerCount).toBe(expected)
      await runtime.executeAsync("SumSolver", { values: [1, 2] })
      expect(executor.workerCount).toBe(expected)
    }
  } finally {
    await Promise.all(runtimes.map((runtime) => runtime.dispose()))
  }
})
