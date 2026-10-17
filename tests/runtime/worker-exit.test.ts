import { expect, test } from "bun:test"
import { SolverRuntime as BunSolverRuntime } from "../../lib/runtime/bun"
import { SolverRuntime as NodeSolverRuntime } from "../../lib/runtime/node"
import { getRejectedError } from "../fixtures/getRejectedError"
import "../fixtures/runtimeSolvers"

test("unexpected zero-code exits reject active and future work on Bun and Node", async (): Promise<void> => {
  const runtimes = [
    new NodeSolverRuntime({
      workerUrl: new URL("../fixtures/runtimeNodeWorker.ts", import.meta.url),
      workerCount: 1,
    }),
    new BunSolverRuntime({
      workerUrl: new URL("../fixtures/runtimeBunWorker.ts", import.meta.url),
      workerCount: 1,
    }),
  ]
  for (const runtime of runtimes) {
    try {
      expect(
        (await getRejectedError(runtime.executeAsync("ExitSolver", {})))
          .message,
      ).toContain("exited unexpectedly")
      expect(
        (
          await getRejectedError(
            runtime.executeAsync("SumSolver", { values: [42] }),
          )
        ).message,
      ).toContain("exited unexpectedly")
    } finally {
      await runtime.dispose()
    }
  }
})
