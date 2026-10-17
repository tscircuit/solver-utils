import { expect, test } from "bun:test"
import { SolverRuntime as NodeSolverRuntime } from "../../lib/runtime/node"
import { getRejectedError } from "../fixtures/getRejectedError"
import "../fixtures/runtimeSolvers"

test("disposal settles running and queued work and is safe during startup", async (): Promise<void> => {
  const workerUrl = new URL("../fixtures/runtimeNodeWorker.ts", import.meta.url)
  const runtime = new NodeSolverRuntime({ workerUrl, workerCount: 1 })
  await runtime.executeAsync("SumSolver", { values: [42] })
  const started = new Int32Array(new SharedArrayBuffer(4))
  const jobs = Promise.allSettled([
    runtime.executeAsync("HangingSolver", { started: started.buffer }),
    runtime.executeAsync("HangingSolver", {}),
  ])
  await Atomics.waitAsync(started, 0, 0).value
  await runtime.dispose()
  for (const job of await jobs) {
    expect(job.status).toBe("rejected")
    if (job.status === "rejected")
      expect(job.reason.message).toBe("Solver runtime disposed")
  }
  await runtime.dispose()
  expect(
    (await getRejectedError(runtime.executeAsync("SumSolver", {}))).message,
  ).toContain("disposed")
  const starting = new NodeSolverRuntime({ workerUrl, workerCount: 2 })
  const pending = starting.executeAsync("SumSolver", { values: [1] })
  const result = Promise.allSettled([pending])
  await starting.dispose()
  expect((await result)[0]!.status).toBe("rejected")
})
