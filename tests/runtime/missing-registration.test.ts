import { expect, test } from "bun:test"
import { SolverRuntime } from "../../lib"
import { SolverRuntime as NodeSolverRuntime } from "../../lib/runtime/node"
import { SumSolver } from "../fixtures/runtimeSolvers"
import { getRejectedError } from "../fixtures/getRejectedError"

test("missing worker registrations use the locally registered constructor unless required", async (): Promise<void> => {
  class LocalOnlySolver extends SumSolver {
    static override readonly solverName: string = "LocalOnlySolver"
  }
  SolverRuntime.registerSolver(LocalOnlySolver)
  const workerUrl = new URL("../fixtures/runtimeNodeWorker.ts", import.meta.url)
  const runtime = new NodeSolverRuntime({ workerUrl, workerCount: 1 })
  const strict = new NodeSolverRuntime({
    workerUrl,
    workerCount: 1,
    requireWorker: true,
  })
  try {
    expect(
      await runtime.executeAsync("LocalOnlySolver", { values: [42] }),
    ).toEqual({ sum: 42, worker: false })
    expect(
      await runtime.executeAsync(LocalOnlySolver, { values: [42] }),
    ).toEqual({ sum: 42, worker: false })
    expect(
      (
        await getRejectedError(
          strict.executeAsync("LocalOnlySolver", { values: [42] }),
        )
      ).message,
    ).toContain("No worker registered")
    expect(
      (await getRejectedError(runtime.executeAsync("runtime-test/unknown", {})))
        .message,
    ).toContain("Unknown solver")
    expect(() => SolverRuntime.registerSolver(LocalOnlySolver)).not.toThrow()
    class DifferentSolver extends SumSolver {
      static override readonly solverName: string = "LocalOnlySolver"
    }
    expect(() => SolverRuntime.registerSolver(DifferentSolver)).toThrow(
      "already registered",
    )
    expect(
      (
        await getRejectedError(
          runtime.executeAsync(DifferentSolver, { values: [1] }),
        )
      ).message,
    ).toContain("different constructor")
  } finally {
    await Promise.all([runtime.dispose(), strict.dispose()])
  }
})
