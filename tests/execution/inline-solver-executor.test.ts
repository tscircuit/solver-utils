import { expect, test } from "bun:test"
import type { SolverTaskDefinition } from "../../lib/execution/SolverExecutor"
import { cloneSolverData } from "../../lib/execution/node/cloneSolverData"
import { createInlineSolverExecutor } from "../../lib/execution/node/createInlineSolverExecutor"

test("inline handlers isolate ordinary inputs, shared metadata, and outputs", async () => {
  type Tasks = {
    edit: SolverTaskDefinition<
      { values: number[] },
      { values: number[]; label: string },
      { metadata: { label: string } }
    >
  }
  const retainedOutputs: Tasks["edit"]["output"][] = []
  const executor = createInlineSolverExecutor<Tasks>({
    edit(input, context) {
      input.values.push(2)
      const label = context.shared.metadata.label
      context.shared.metadata.label = "changed by handler"
      const result = { values: input.values, label }
      retainedOutputs.push(result)
      return result
    },
  })
  try {
    const input = { values: [1] }
    const context = { shared: { metadata: { label: "original" } } }
    const first = executor.execute("edit", input, context)
    input.values.push(3)
    const firstResult = await first
    expect(firstResult).toEqual({ values: [1, 2], label: "original" })
    expect(input.values).toEqual([1, 3])
    expect(context.shared.metadata.label).toBe("original")

    const secondResult = await executor.execute("edit", input, context)
    expect(secondResult).toEqual({ values: [1, 3, 2], label: "original" })
    firstResult.values.push(4)
    expect(retainedOutputs[0]?.values).toEqual([1, 2])
    retainedOutputs[1]!.values.push(5)
    expect(secondResult.values).toEqual([1, 3, 2])
  } finally {
    await executor.dispose()
  }
})

test("native clone preserves cycles, aliases, maps, and ordinary buffer isolation", async () => {
  const bytes = new Uint8Array([1, 2, 3, 4])
  const entry = { value: 42 }
  const source: {
    self?: unknown
    first: typeof entry
    second: typeof entry
    map: Map<string, typeof entry>
    view: Uint8Array
    dataView: DataView
  } = {
    first: entry,
    second: entry,
    map: new Map([["entry", entry]]),
    view: bytes.subarray(1, 3),
    dataView: new DataView(bytes.buffer, 1, 2),
  }
  source.self = source
  const cloned = await cloneSolverData(source)
  expect(cloned).not.toBe(source)
  expect(cloned.self).toBe(cloned)
  expect(cloned.first).toBe(cloned.second)
  expect(cloned.map.get("entry")).toBe(cloned.first)
  expect(cloned.first).not.toBe(entry)
  expect(cloned.view.byteOffset).toBe(1)
  expect(cloned.view.byteLength).toBe(2)
  expect(cloned.view.buffer).toBe(cloned.dataView.buffer)
  cloned.view[0] = 99
  expect(cloned.dataView.getUint8(0)).toBe(99)
  expect(bytes[1]).toBe(2)
})

test("inline transport retains shared backing for bare buffers and offset views", async () => {
  type Tasks = {
    inspect: SolverTaskDefinition<
      { buffer: SharedArrayBuffer; view: Int32Array },
      { buffer: SharedArrayBuffer; view: Int32Array; value: number },
      { output: SharedArrayBuffer }
    >
  }
  const topology = new SharedArrayBuffer(3 * Int32Array.BYTES_PER_ELEMENT)
  new Int32Array(topology).set([10, 20, 30])
  const output = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT)
  const executor = createInlineSolverExecutor<Tasks>({
    inspect(input, context) {
      expect(input.buffer).toBeInstanceOf(SharedArrayBuffer)
      expect(input.view.buffer).toBeInstanceOf(SharedArrayBuffer)
      expect(input.view.buffer).toBe(input.buffer)
      expect(input.view.byteOffset).toBe(Int32Array.BYTES_PER_ELEMENT)
      const value = input.view[0]!
      Atomics.store(new Int32Array(context.shared.output), 0, value)
      return { buffer: input.buffer, view: input.view, value }
    },
  })
  try {
    const result = await executor.execute(
      "inspect",
      {
        buffer: topology,
        view: new Int32Array(topology, Int32Array.BYTES_PER_ELEMENT, 1),
      },
      { shared: { output } },
    )
    expect(result.value).toBe(20)
    expect(Atomics.load(new Int32Array(output), 0)).toBe(20)
    expect(result.buffer).toBeInstanceOf(SharedArrayBuffer)
    expect(result.view.buffer).toBe(result.buffer)
    expect(result.view.byteLength).toBe(Int32Array.BYTES_PER_ELEMENT)
    // Publish a new value after the task has finished to verify shared storage.
    Atomics.store(new Int32Array(topology), 1, 42)
    expect(result.view[0]).toBe(42)
  } finally {
    await executor.dispose()
  }
})

test("async handlers can complete independently of submission order", async () => {
  type Tasks = {
    wait: SolverTaskDefinition<{ wait: boolean }, number>
  }
  let release!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const executor = createInlineSolverExecutor<Tasks>({
    async wait(input) {
      if (input.wait) await gate
      return input.wait ? 1 : 2
    },
  })
  try {
    const first = executor.execute(
      "wait",
      { wait: true },
      { shared: undefined },
    )
    const second = executor.execute(
      "wait",
      { wait: false },
      { shared: undefined },
    )
    expect(await second).toBe(2)
    release()
    expect(await first).toBe(1)
  } finally {
    release()
    await executor.dispose()
  }
})

test("clone failures and handler errors reject only the affected request", async () => {
  type Tasks = {
    run: SolverTaskDefinition<{ action: string; invalid?: unknown }, unknown>
  }
  let calls = 0
  const executor = createInlineSolverExecutor<Tasks>({
    run(input) {
      calls++
      if (input.action === "throw") throw new Error("handler failure")
      if (input.action === "reject") {
        return Promise.reject(new Error("async handler failure"))
      }
      if (input.action === "invalid-output") return () => undefined
      return "ok"
    },
  })
  try {
    await expect(
      executor.execute(
        "run",
        { action: "ok", invalid: () => undefined },
        { shared: undefined },
      ),
    ).rejects.toThrow()
    expect(calls).toBe(0)
    for (const action of ["throw", "reject", "invalid-output"]) {
      await expect(
        executor.execute("run", { action }, { shared: undefined }),
      ).rejects.toThrow()
    }
    expect(
      await executor.execute("run", { action: "ok" }, { shared: undefined }),
    ).toBe("ok")
  } finally {
    await executor.dispose()
  }
})

test("dispose rejects new work immediately and drains accepted requests once", async () => {
  type Tasks = { run: SolverTaskDefinition<undefined, number> }
  let release!: () => void
  let started!: () => void
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })
  const handlerStarted = new Promise<void>((resolve) => {
    started = resolve
  })
  const executor = createInlineSolverExecutor<Tasks>({
    async run() {
      started()
      await gate
      return 42
    },
  })
  const request = executor.execute("run", undefined, { shared: undefined })
  await handlerStarted
  const disposal = executor.dispose()
  expect(executor.dispose()).toBe(disposal)
  let disposed = false
  void disposal.then(() => {
    disposed = true
  })
  await expect(
    executor.execute("run", undefined, { shared: undefined }),
  ).rejects.toThrow("disposed")
  expect(disposed).toBe(false)
  release()
  expect(await request).toBe(42)
  await disposal
  expect(disposed).toBe(true)
})
