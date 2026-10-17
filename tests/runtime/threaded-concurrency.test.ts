import { expect, test } from "bun:test"
import { createTestRuntimes } from "../fixtures/createTestRuntimes"
import "../fixtures/runtimeSolvers"

test("Bun and Node pools execute synchronous solvers concurrently and reuse workers", async (): Promise<void> => {
  const runtimes = createTestRuntimes()
  await runtimes[0]!.dispose()
  for (const runtime of runtimes.slice(1)) {
    try {
      const buffer = new SharedArrayBuffer(4)
      const outputs = await Promise.all([
        runtime.executeAsync("BarrierSolver", { buffer }),
        runtime.executeAsync("BarrierSolver", { buffer }),
      ])
      expect(outputs).toEqual([2, 2])
      const sums = await Promise.all(
        Array.from({ length: 12 }, (_, n) =>
          runtime.executeAsync("SumSolver", { values: [n, 1] }),
        ),
      )
      expect(sums).toEqual(
        Array.from({ length: 12 }, (_, n) => ({ sum: n + 1, worker: true })),
      )
    } finally {
      await runtime.dispose()
    }
  }
})
