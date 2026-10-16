import { expect, test } from "bun:test"
import type { SolverTaskDefinition } from "../../lib/execution/SolverExecutor"
import { createNodeSolverExecutor } from "../../lib/execution/node/createNodeSolverExecutor"

type Tasks = {
  probe: SolverTaskDefinition<{ mode: string; value?: number }, unknown>
  unknown: SolverTaskDefinition<{ mode: string }, unknown>
  constructor: SolverTaskDefinition<{ mode: string }, unknown>
  toString: SolverTaskDefinition<{ mode: string }, unknown>
}

const context = { shared: undefined }
const fixture = (name: string): URL =>
  new URL(`../fixtures/solver-executor/failures/${name}.ts`, import.meta.url)

test("worker startup exceptions and exits poison queued and future requests", async (): Promise<void> => {
  for (const name of ["startup-throw", "startup-exit"]) {
    const executor = await createNodeSolverExecutor<Tasks>({
      workerUrl: fixture(name),
      workers: 2,
    })
    try {
      const results = await Promise.allSettled([
        executor.execute("probe", { mode: "ok" }, context),
        executor.execute("probe", { mode: "ok" }, context),
        executor.execute("probe", { mode: "ok" }, context),
      ])
      expect(results.every((result) => result.status === "rejected")).toBe(true)
      const first = results[0]
      if (!first || first.status !== "rejected")
        throw new Error("Expected startup failure")
      const expected =
        name === "startup-throw"
          ? "startup failed deliberately"
          : "exited unexpectedly (7)"
      expect(String(first.reason)).toContain(expected)
      const later = await executor
        .execute("probe", { mode: "ok" }, context)
        .catch((error: unknown) => error)
      expect(later).toBe(first.reason)
    } finally {
      await executor.dispose()
    }
  }
})

test("never-ready workers reach their startup deadline even while disposal drains", async (): Promise<void> => {
  const executor = await createNodeSolverExecutor<Tasks>({
    workerUrl: fixture("never-ready"),
    workers: 1,
    startupTimeoutMs: 20,
  })
  const task = executor.execute("probe", { mode: "ok" }, context)
  const rejected = expect(task).rejects.toThrow("startup deadline")
  const disposal = executor.dispose()
  expect(executor.dispose()).toBe(disposal)
  await rejected
  await disposal
})

test("malformed replies, bad versions, unknown IDs, duplicate readiness and exits fail the pool", async (): Promise<void> => {
  for (const mode of [
    "version",
    "unknown-id",
    "missing-output",
    "malformed-error",
    "duplicate-ready",
    "exit",
  ]) {
    const executor = await createNodeSolverExecutor<Tasks>({
      workerUrl: fixture("protocol"),
      workers: 1,
    })
    try {
      const results = await Promise.allSettled([
        executor.execute("probe", { mode }, context),
        executor.execute("probe", { mode: "ok" }, context),
      ])
      expect(results.every((result) => result.status === "rejected")).toBe(true)
      const first = results[0]
      if (!first || first.status !== "rejected")
        throw new Error("Expected protocol failure")
      await expect(
        executor.execute("probe", { mode: "ok" }, context),
      ).rejects.toBe(first.reason)
    } finally {
      await executor.dispose()
    }
  }
  const executor = await createNodeSolverExecutor<Tasks>({
    workerUrl: fixture("result-before-ready"),
    workers: 1,
  })
  try {
    await expect(
      executor.execute("probe", { mode: "ok" }, context),
    ).rejects.toThrow("active request")
  } finally {
    await executor.dispose()
  }
})

test("task errors and uncloneable results reject only their own request", async (): Promise<void> => {
  const executor = await createNodeSolverExecutor<Tasks>({
    workerUrl: fixture("task-errors"),
    workers: 1,
  })
  try {
    for (const mode of ["throw", "uncloneable-output", "circular-error"]) {
      await expect(
        executor.execute("probe", { mode }, context),
      ).rejects.toBeInstanceOf(Error)
      await expect(
        executor.execute("probe", { mode: "ok", value: 17 }, context),
      ).resolves.toBe(17)
    }
    for (const kind of ["unknown", "constructor", "toString"] as const) {
      await expect(
        executor.execute(kind, { mode: "ok" }, context),
      ).rejects.toThrow(`Unknown solver task kind: ${kind}`)
      await expect(
        executor.execute("probe", { mode: "ok" }, context),
      ).resolves.toBe(42)
    }
  } finally {
    await executor.dispose()
  }
})

test("uncloneable input is task-specific and does not start or poison workers", async (): Promise<void> => {
  const executor = await createNodeSolverExecutor<Tasks>({
    workerUrl: fixture("task-errors"),
    workers: 1,
  })
  try {
    const invalidInput = { mode: "ok", uncloneable: (): number => 1 }
    await expect(
      executor.execute("probe", invalidInput, context),
    ).rejects.toBeInstanceOf(Error)
    await expect(
      executor.execute("probe", { mode: "ok", value: 5 }, context),
    ).resolves.toBe(5)
  } finally {
    await executor.dispose()
  }
  const neverStarted = await createNodeSolverExecutor<Tasks>({
    workerUrl: fixture("startup-throw"),
    workers: 1,
  })
  await expect(
    neverStarted.execute(
      "probe",
      { mode: "ok", uncloneable: (): number => 1 } as { mode: string },
      context,
    ),
  ).rejects.toBeInstanceOf(Error)
  await neverStarted.dispose()
})

test("fatal failure terminates all shared-memory readers before active requests reject", async (): Promise<void> => {
  type SharedTasks = {
    probe: SolverTaskDefinition<{ mode: string }, unknown, SharedArrayBuffer>
  }
  const shared = new SharedArrayBuffer(2 * Int32Array.BYTES_PER_ELEMENT)
  const control = new Int32Array(shared)
  const executor = await createNodeSolverExecutor<SharedTasks>({
    workerUrl: fixture("active-shared-memory"),
    workers: 2,
  })
  try {
    const results = await Promise.allSettled([
      executor.execute("probe", { mode: "increment" }, { shared }),
      executor.execute("probe", { mode: "crash" }, { shared }),
    ])
    expect(results.every((result) => result.status === "rejected")).toBe(true)
    expect(Atomics.load(control, 0)).toBe(1)
    const countAtSettlement = Atomics.load(control, 1)
    await new Promise<void>((resolve) => setImmediate(resolve))
    expect(Atomics.load(control, 1)).toBe(countAtSettlement)
  } finally {
    await executor.dispose()
  }
})
