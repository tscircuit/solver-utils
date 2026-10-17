import { expect, test } from "bun:test"
import { SolverRuntime } from "../../lib"
import { SolverRuntime as NodeSolverRuntime } from "../../lib/runtime/node"
import { getRejectedError } from "../fixtures/getRejectedError"
import "../fixtures/runtimeSolvers"

test("startup failures are explicit, with an opt-in diagnosed serial policy and strict override", async (): Promise<void> => {
  const diagnostics: Error[] = []
  for (const requireWorker of [false, true]) {
    const runtime = new SolverRuntime({
      createWorker: () => {
        throw new Error("packaging is broken")
      },
      startupFailure: "serial",
      requireWorker,
      onDiagnostic: (error) => diagnostics.push(error),
    })
    try {
      if (requireWorker) {
        expect(
          (
            await getRejectedError(
              runtime.executeAsync("runtime-test/sum", { values: [42] }),
            )
          ).message,
        ).toContain("packaging is broken")
      } else {
        expect(
          await runtime.executeAsync("runtime-test/sum", { values: [42] }),
        ).toEqual({ sum: 42, worker: false })
      }
    } finally {
      await runtime.dispose()
    }
  }
  expect(diagnostics.map((error) => error.message)).toEqual([
    "packaging is broken",
  ])
  let created = 0
  let terminated = 0
  const partial = new SolverRuntime({
    workerCount: 2,
    createWorker: () => {
      if (created++ === 1) throw new Error("second worker failed to start")
      return {
        postMessage: () => {},
        onMessage: () => () => {},
        onError: () => () => {},
        terminate: () => {
          terminated++
        },
      }
    },
  })
  try {
    expect(
      (await getRejectedError(partial.executeAsync("runtime-test/sum", {})))
        .message,
    ).toContain("second worker failed")
    expect(terminated).toBe(1)
  } finally {
    await partial.dispose()
  }
  const exited = new NodeSolverRuntime({
    workerSource: "process.exit(0)",
    workerCount: 1,
  })
  const timedOut = new NodeSolverRuntime({
    workerSource: "setInterval(() => {}, 1000)",
    workerCount: 1,
    startupTimeoutMs: 20,
  })
  try {
    expect(
      (await getRejectedError(exited.executeAsync("runtime-test/sum", {})))
        .message,
    ).toContain("exited unexpectedly")
    expect(
      (await getRejectedError(timedOut.executeAsync("runtime-test/sum", {})))
        .message,
    ).toContain("startup timed out")
  } finally {
    await Promise.all([exited.dispose(), timedOut.dispose()])
  }
  expect(() => new SolverRuntime({ workerCount: 0 })).toThrow("workerCount")
  expect(() => new SolverRuntime({ startupTimeoutMs: Infinity })).toThrow(
    "startupTimeoutMs",
  )
})
