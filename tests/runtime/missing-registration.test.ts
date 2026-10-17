import { expect, test } from "bun:test"
import { SolverRuntime } from "../../lib"
import { SolverRuntime as NodeSolverRuntime } from "../../lib/runtime/node"
import { SumSolver } from "../fixtures/runtimeSolvers"
import { getRejectedError } from "../fixtures/getRejectedError"

test("missing worker registrations use the locally registered constructor unless required", async (): Promise<void> => {
  SolverRuntime.registerSolver("runtime-test/local-only", SumSolver)
  const workerUrl = new URL("../fixtures/runtimeNodeWorker.ts", import.meta.url)
  const runtime = new NodeSolverRuntime({ workerUrl, workerCount: 1 })
  const strict = new NodeSolverRuntime({
    workerUrl,
    workerCount: 1,
    requireWorker: true,
  })
  try {
    expect(
      await runtime.executeAsync("runtime-test/local-only", { values: [42] }),
    ).toEqual({ sum: 42, worker: false })
    expect(
      (
        await getRejectedError(
          strict.executeAsync("runtime-test/local-only", { values: [42] }),
        )
      ).message,
    ).toContain("No worker registered")
    expect(
      (await getRejectedError(runtime.executeAsync("runtime-test/unknown", {})))
        .message,
    ).toContain("Unknown solver")
    expect(() =>
      SolverRuntime.registerSolver("runtime-test/local-only", SumSolver),
    ).not.toThrow()
    class DifferentSolver extends SumSolver {}
    expect(() =>
      SolverRuntime.registerSolver("runtime-test/local-only", DifferentSolver),
    ).toThrow("already registered")
  } finally {
    await Promise.all([runtime.dispose(), strict.dispose()])
  }
})
