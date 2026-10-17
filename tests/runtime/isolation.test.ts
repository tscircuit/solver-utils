import { expect, test } from "bun:test"
import { createTestRuntimes } from "../fixtures/createTestRuntimes"
import { getRejectedError } from "../fixtures/getRejectedError"
import "../fixtures/runtimeSolvers"

test("inline and threaded execution isolate data while preserving shared storage", async (): Promise<void> => {
  for (const runtime of createTestRuntimes()) {
    try {
      const input = { values: [1], shared: new SharedArrayBuffer(4) }
      const pending = runtime.executeAsync("runtime-test/isolation", input)
      input.values[0] = 2
      const output = await pending
      expect(input.values).toEqual([2])
      expect(output.values).toEqual([100])
      expect(output.shared).toBeInstanceOf(SharedArrayBuffer)
      expect(Atomics.load(new Int32Array(input.shared), 0)).toBe(1)
      Atomics.add(new Int32Array(output.shared), 0, 1)
      expect(Atomics.load(new Int32Array(input.shared), 0)).toBe(2)
      expect(
        await getRejectedError(
          runtime.executeAsync("runtime-test/uncloneable", {}),
        ),
      ).toBeInstanceOf(Error)
      expect(
        await getRejectedError(
          runtime.executeAsync("runtime-test/sum", { callback: () => {} }),
        ),
      ).toBeInstanceOf(Error)
    } finally {
      await runtime.dispose()
    }
  }
})
