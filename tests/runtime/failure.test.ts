import { expect, test } from "bun:test"
import { createTestRuntimes } from "../fixtures/createTestRuntimes"
import { getRejectedError } from "../fixtures/getRejectedError"
import "../fixtures/runtimeSolvers"

test("execution failures reject without serial retries and leave healthy workers usable", async (): Promise<void> => {
  for (const runtime of createTestRuntimes()) {
    try {
      const failure = runtime.executeAsync("runtime-test/failure", {})
      expect((await getRejectedError(failure)).message).toContain(
        "intentional solver failure",
      )
      expect(
        (
          await getRejectedError(
            runtime.executeAsync("runtime-test/failed-state", {}),
          )
        ).message,
      ).toContain("solver reported failure")
      expect(
        (await runtime.executeAsync("runtime-test/sum", { values: [42] })).sum,
      ).toBe(42)
    } finally {
      await runtime.dispose()
    }
  }
})
