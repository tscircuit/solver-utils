import { expect, test } from "bun:test"
import { createSharedSolverBuffer } from "../../lib/execution/createSharedSolverBuffer"
import { createInlineSolverExecutor } from "../../lib/execution/createInlineSolverExecutor"
import { createNodeSolverExecutor } from "../../lib/execution/node/createNodeSolverExecutor"
import { handlers, type TestTasks } from "../fixtures/solver-executor/tasks"

const workerUrl = new URL(
  "../fixtures/solver-executor/worker.ts",
  import.meta.url,
)

test("persistent pools match inline results across worker counts and reuse threads", async () => {
  const inline = createInlineSolverExecutor<TestTasks>(handlers)
  const inputs = Array.from({ length: 16 }, (_, value) => ({
    value,
    delayMs: 1,
  }))
  try {
    const reference = await Promise.all(
      inputs.map((input) =>
        inline.execute("test/square", input, { shared: undefined }),
      ),
    )
    for (const workers of [1, 2, 4]) {
      const executor = await createNodeSolverExecutor<TestTasks>({
        workerUrl,
        workers,
      })
      try {
        const results = await Promise.all(
          inputs.map((input) =>
            executor.execute("test/square", input, { shared: undefined }),
          ),
        )
        expect(JSON.stringify(results.map((result) => result.value))).toBe(
          JSON.stringify(reference.map((result) => result.value)),
        )
        const threadIds = new Set(results.map((result) => result.threadId))
        expect(threadIds.size).toBeLessThanOrEqual(workers)
        expect([...threadIds].every((id) => id > 0)).toBe(true)
        const later = await executor.execute(
          "test/square",
          { value: 20 },
          { shared: undefined },
        )
        expect(threadIds.has(later.threadId)).toBe(true)
      } finally {
        await executor.dispose()
      }
    }
  } finally {
    await inline.dispose()
  }
})

test("requests remain correlated when two workers finish in reversed order", async () => {
  const executor = await createNodeSolverExecutor<TestTasks>({
    workerUrl,
    workers: 2,
  })
  const control = new Int32Array(
    new SharedArrayBuffer(4 * Int32Array.BYTES_PER_ELEMENT),
  )
  const context = { shared: { control: control.buffer } }
  const completed: number[] = []
  try {
    const first = executor
      .execute("test/gate", { slot: 0, value: 10 }, context)
      .then((result) => {
        completed.push(result.value)
        return result
      })
    const second = executor
      .execute("test/gate", { slot: 1, value: 20 }, context)
      .then((result) => {
        completed.push(result.value)
        return result
      })
    while (Atomics.load(control, 0) !== 1 || Atomics.load(control, 1) !== 1) {
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    Atomics.store(control, 3, 1)
    const secondResult = await second
    expect(secondResult.value).toBe(20)
    expect(completed).toEqual([20])
    Atomics.store(control, 2, 1)
    const firstResult = await first
    expect(firstResult.value).toBe(10)
    expect(firstResult.threadId).not.toBe(secondResult.threadId)
    expect(completed).toEqual([20, 10])
  } finally {
    Atomics.store(control, 2, 1)
    Atomics.store(control, 3, 1)
    await executor.dispose()
  }
})

test("queued tasks snapshot ordinary data at submission and retain shared backing", async () => {
  const executor = await createNodeSolverExecutor<TestTasks>({
    workerUrl,
    workers: 1,
  })
  const inline = createInlineSolverExecutor<TestTasks>(handlers)
  const control = new Int32Array(
    new SharedArrayBuffer(4 * Int32Array.BYTES_PER_ELEMENT),
  )
  const topology = createSharedSolverBuffer(new Int32Array([10, 20, 30]))
  try {
    const blocked = executor.execute(
      "test/gate",
      { slot: 0, value: 1 },
      {
        shared: { control: control.buffer },
      },
    )
    while (Atomics.load(control, 0) !== 1) {
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    const input = { values: [1] }
    const context = { shared: { metadata: { label: "original" }, topology } }
    const request = executor.execute("test/inspect", input, context)
    input.values.push(2)
    context.shared.metadata.label = "caller changed"
    Atomics.store(control, 2, 1)
    await blocked
    const result = await request
    const reference = await inline.execute(
      "test/inspect",
      { values: [1] },
      {
        shared: { metadata: { label: "original" }, topology },
      },
    )
    expect(JSON.stringify(result)).toBe(JSON.stringify(reference))
    expect(result.values).toEqual([1, 99])
    expect(result.label).toBe("original")
    expect(result.sharedValue).toBe(10)
    expect(input.values).toEqual([1, 2])
    expect(context.shared.metadata.label).toBe("caller changed")
    expect(result.topology).toBeInstanceOf(SharedArrayBuffer)
    expect(result.view.buffer).toBe(result.topology)
    expect(result.view.byteOffset).toBe(Int32Array.BYTES_PER_ELEMENT)
    Atomics.store(new Int32Array(topology), 1, 42)
    expect(result.view[0]).toBe(42)
    expect(reference.view[0]).toBe(42)
  } finally {
    Atomics.store(control, 2, 1)
    await Promise.all([executor.dispose(), inline.dispose()])
  }
})

test("task errors have matching inline and worker names/messages and permit reuse", async () => {
  const inline = createInlineSolverExecutor<TestTasks>(handlers)
  const worker = await createNodeSolverExecutor<TestTasks>({
    workerUrl,
    workers: 1,
  })
  try {
    for (const mode of ["throw", "reject", "primitive", "output"] as const) {
      const results = await Promise.allSettled([
        inline.execute("test/fail", { mode }, { shared: undefined }),
        worker.execute("test/fail", { mode }, { shared: undefined }),
      ])
      const errors = results.map((result) => {
        expect(result.status).toBe("rejected")
        if (result.status !== "rejected")
          throw new Error("Expected task rejection")
        expect(result.reason).toBeInstanceOf(Error)
        return { name: result.reason.name, message: result.reason.message }
      })
      expect(errors[0]).toEqual(errors[1])
    }
    const result = await worker.execute(
      "test/square",
      { value: 3 },
      { shared: undefined },
    )
    expect(result.value).toBe(9)
  } finally {
    await Promise.all([inline.dispose(), worker.dispose()])
  }
})

test("dispose stops submissions immediately and drains accepted queued tasks", async () => {
  const executor = await createNodeSolverExecutor<TestTasks>({
    workerUrl,
    workers: 1,
  })
  const first = executor.execute(
    "test/square",
    { value: 3, delayMs: 2 },
    { shared: undefined },
  )
  const second = executor.execute(
    "test/square",
    { value: 4 },
    { shared: undefined },
  )
  const disposal = executor.dispose()
  expect(executor.dispose()).toBe(disposal)
  await expect(
    executor.execute("test/square", { value: 5 }, { shared: undefined }),
  ).rejects.toThrow("disposed")
  expect((await first).value).toBe(9)
  expect((await second).value).toBe(16)
  await disposal
})

test("pool configuration is validated and an unused executor needs no worker", async () => {
  for (const workers of [0, -1, 1.5, NaN, Infinity]) {
    await expect(
      createNodeSolverExecutor({ workerUrl, workers }),
    ).rejects.toThrow("positive integer")
  }
  for (const startupTimeoutMs of [0, -1, NaN, Infinity, 2_147_483_648]) {
    await expect(
      createNodeSolverExecutor({ workerUrl, workers: 1, startupTimeoutMs }),
    ).rejects.toThrow("startup timeout")
  }
  const unused = await createNodeSolverExecutor<TestTasks>({
    workerUrl: new URL("./missing-worker.js", import.meta.url),
    workers: 1,
  })
  const disposal = unused.dispose()
  expect(unused.dispose()).toBe(disposal)
  await disposal
  await expect(
    unused.execute("test/square", { value: 1 }, { shared: undefined }),
  ).rejects.toThrow("disposed")
})
