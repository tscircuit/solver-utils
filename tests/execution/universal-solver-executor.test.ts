import { expect, test } from "bun:test"
import { createInlineSolverExecutor } from "../../lib/execution/createInlineSolverExecutor"
import { createTaskExecutor } from "../../lib/execution/createTaskExecutor"
import { handlers, type TestTasks } from "../fixtures/solver-executor/tasks"

const workerUrl = new URL(
  "../fixtures/solver-executor/worker.ts",
  import.meta.url,
)

test("the internal task executor uses native workers and matches inline results at each width", async (): Promise<void> => {
  const inline = createInlineSolverExecutor<TestTasks>(handlers)
  const inputs = Array.from({ length: 12 }, (_, value) => ({
    value,
    delayMs: 1,
  }))
  try {
    const expected = await Promise.all(
      inputs.map((input) =>
        inline.execute("test/square", input, { shared: undefined }),
      ),
    )
    for (const workers of [undefined, 1, 2, 4]) {
      const executor = await createTaskExecutor<TestTasks>({
        handlers,
        workerUrl,
        workers,
      })
      try {
        const actual = await Promise.all(
          inputs.map((input) =>
            executor.execute("test/square", input, { shared: undefined }),
          ),
        )
        expect(actual.map((result) => result.value)).toEqual(
          expected.map((result) => result.value),
        )
        const threads = new Set(actual.map((result) => result.threadId))
        expect(threads.size).toBeLessThanOrEqual(workers ?? 2)
        expect([...threads].every((threadId) => threadId > 0)).toBe(true)
        const later = await executor.execute(
          "test/square",
          { value: 13 },
          { shared: undefined },
        )
        expect(threads.has(later.threadId)).toBe(true)
      } finally {
        await executor.dispose()
      }
    }
  } finally {
    await inline.dispose()
  }
})

test("omitting the task worker module selects inline execution even on a Node host", async (): Promise<void> => {
  const executor = await createTaskExecutor<TestTasks>({
    handlers,
    workers: 4,
  })
  try {
    await expect(
      executor.execute("test/square", { value: 3 }, { shared: undefined }),
    ).resolves.toEqual({ value: 9, threadId: 0 })
  } finally {
    await executor.dispose()
  }
})

test("the internal task executor validates worker counts before selecting a runtime", async (): Promise<void> => {
  for (const workers of [0, -1, 1.5, NaN, Infinity]) {
    await expect(
      createTaskExecutor<TestTasks>({ handlers, workers }),
    ).rejects.toThrow("positive integer")
  }
})

test("the public entrypoint bundles for browsers without externalizing Node builtins", async (): Promise<void> => {
  const bundle = await Bun.build({
    entrypoints: [new URL("../../lib/index.ts", import.meta.url).pathname],
    target: "browser",
    format: "esm",
    // The graphics peer is unrelated to executor portability and is supplied by
    // the consuming application. Native modules are deliberately not external.
    external: ["graphics-debug"],
  })
  expect(bundle.success).toBe(true)
  expect(bundle.outputs.length).toBeGreaterThan(0)
})

test("a browser-like host ignores worker configuration and preserves inline semantics", async (): Promise<void> => {
  const entrypoint = new URL(
    "../../lib/execution/createTaskExecutor.ts",
    import.meta.url,
  ).href
  for (const simulatedProcess of [
    "undefined",
    JSON.stringify({
      versions: { node: "20.0.0" },
      release: { name: "browser" },
    }),
  ]) {
    const script = `
    const writeResult = Bun.write.bind(Bun, Bun.stdout)
    Object.defineProperty(globalThis, "process", { value: ${simulatedProcess}, configurable: true })
    const { createTaskExecutor } = await import(${JSON.stringify(entrypoint)})
    let handlerOutput
    const handlers = {
      "local/mutate": (input, context) => {
        input.values.push(7)
        const label = context.shared.metadata.label
        context.shared.metadata.label = "handler changed"
        handlerOutput = { values: input.values, label }
        return handlerOutput
      },
      "local/fail": () => { throw new TypeError("browser task failure") },
      "local/shared": (_input, context) => ({
        buffer: context.shared.buffer,
        view: new Int32Array(context.shared.buffer),
      }),
    }
    const executor = await createTaskExecutor({
      handlers,
      workers: 4,
      workerUrl: new URL("file:///a-worker-that-does-not-exist.js"),
    })
    const input = { values: [1] }
    const context = { shared: { metadata: { label: "original" } } }
    const pending = executor.execute("local/mutate", input, context)
    input.values.push(2)
    context.shared.metadata.label = "caller changed"
    const output = await pending
    output.values.push(9)
    const taskError = await executor.execute("local/fail", null, { shared: undefined }).catch((error) => ({ name: error.name, message: error.message }))
    const sharedBuffer = new SharedArrayBuffer(4)
    const sharedOutput = await executor.execute("local/shared", null, { shared: { buffer: sharedBuffer } })
    new Int32Array(sharedBuffer)[0] = 42
    const disposal = executor.dispose()
    const sameDisposal = executor.dispose() === disposal
    const disposedError = await executor.execute("local/fail", null, { shared: undefined }).catch((error) => error.message)
    await disposal
    await writeResult(JSON.stringify({
      output,
      handlerOutput,
      input,
      context,
      taskError,
      sharedValue: sharedOutput.view[0],
      sameDisposal,
      disposedError,
    }))
  `
    const child = Bun.spawn(
      [process.execPath, "--preserve-symlinks", "--eval", script],
      {
        stdout: "pipe",
        stderr: "pipe",
      },
    )
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ])
    expect({ exitCode, stderr }).toEqual({ exitCode: 0, stderr: "" })
    expect(JSON.parse(stdout)).toEqual({
      output: { values: [1, 7, 9], label: "original" },
      handlerOutput: { values: [1, 7], label: "original" },
      input: { values: [1, 2] },
      context: { shared: { metadata: { label: "caller changed" } } },
      taskError: { name: "TypeError", message: "browser task failure" },
      sharedValue: 42,
      sameDisposal: true,
      disposedError: "Solver executor has been disposed",
    })
  }
})
