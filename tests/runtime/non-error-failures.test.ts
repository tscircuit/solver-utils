import { expect, test } from "bun:test"
import { SolverRuntime } from "../../lib/runtime/SolverRuntime"

const fallbackMessage =
  "Solver threw a value that could not be converted to a string"

class SuccessfulSolver {
  static readonly solverName = "runtime-non-error/healthy"
  solve(): void {}
  getOutput(): number {
    return 42
  }
}

SolverRuntime.registerSolver(SuccessfulSolver)

async function getRejection(pending: Promise<unknown>): Promise<Error> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const result = await Promise.race([
      pending.then(
        () => ({ status: "fulfilled" as const }),
        (error: unknown) => ({ status: "rejected" as const, error }),
      ),
      new Promise<{ status: "timeout" }>((resolve) => {
        timer = setTimeout(() => resolve({ status: "timeout" }), 1000)
      }),
    ])
    expect(result.status).toBe("rejected")
    if (result.status !== "rejected") throw new Error("Expected rejection")
    expect(result.error).toBeInstanceOf(Error)
    return result.error as Error
  } finally {
    clearTimeout(timer)
  }
}

const cases: Array<[string, () => unknown, string]> = [
  ["null prototype", () => Object.create(null), fallbackMessage],
  [
    "throwing toString",
    () => ({
      toString() {
        throw new Error("toString failed")
      },
    }),
    fallbackMessage,
  ],
  [
    "throwing valueOf",
    () => ({
      toString: () => ({}),
      valueOf() {
        throw new Error("valueOf failed")
      },
    }),
    fallbackMessage,
  ],
  [
    "throwing Symbol.toPrimitive",
    () => ({
      [Symbol.toPrimitive]() {
        throw new Error("primitive conversion failed")
      },
    }),
    fallbackMessage,
  ],
  [
    "revoked proxy",
    () => {
      const { proxy, revoke } = Proxy.revocable({}, {})
      revoke()
      return proxy
    },
    fallbackMessage,
  ],
  ["Error", () => new TypeError("original failure"), "original failure"],
  ["string", () => "string failure", "string failure"],
  ["null", () => null, "null"],
  ["undefined", () => undefined, "undefined"],
  ["symbol", () => Symbol("failure"), "Symbol(failure)"],
]

for (const [label, createValue, expectedMessage] of cases) {
  test(`inline execution rejects ${label} without stranding the request`, async (): Promise<void> => {
    const value = createValue()
    class ThrowingSolver {
      static readonly solverName = `runtime-non-error/${label}`
      solve(): void {
        throw value
      }
      getOutput(): never {
        throw new Error("must not read output after a failed solve")
      }
    }
    SolverRuntime.registerSolver(ThrowingSolver)
    const runtime = new SolverRuntime()
    const unhandled: unknown[] = []
    const onUnhandled = (error: unknown): void => {
      unhandled.push(error)
    }
    process.on("unhandledRejection", onUnhandled)
    try {
      const error = await getRejection(
        runtime.executeAsync(ThrowingSolver, undefined),
      )
      expect(error.message).toBe(expectedMessage)
      if (label === "Error") expect(value).toBe(error)
      expect(await runtime.executeAsync(SuccessfulSolver, undefined)).toBe(42)
      await Bun.sleep(0)
      expect(unhandled).toEqual([])
    } finally {
      await runtime.dispose()
      process.off("unhandledRejection", onUnhandled)
    }
  })
}

test("input snapshot failures reject even when the thrown value cannot be printed", async (): Promise<void> => {
  const runtime = new SolverRuntime()
  try {
    const input = {
      get value() {
        throw Object.create(null)
      },
    }
    expect(
      (
        await getRejection(
          runtime.executeAsync("runtime-non-error/healthy", input),
        )
      ).message,
    ).toBe(fallbackMessage)
    expect(await runtime.executeAsync(SuccessfulSolver, undefined)).toBe(42)
  } finally {
    await runtime.dispose()
  }
})

test("unprintable startup failures still reach the diagnosed serial fallback", async (): Promise<void> => {
  const diagnostics: Error[] = []
  let attempts = 0
  const runtime = new SolverRuntime({
    createWorker: () => {
      attempts++
      throw Object.create(null)
    },
    startupFailure: "serial",
    onDiagnostic: (error) => diagnostics.push(error),
  })
  try {
    expect(await runtime.executeAsync(SuccessfulSolver, undefined)).toBe(42)
    expect(await runtime.executeAsync(SuccessfulSolver, undefined)).toBe(42)
    expect(attempts).toBe(1)
    expect(diagnostics.map((error) => error.message)).toEqual([fallbackMessage])
  } finally {
    await runtime.dispose()
  }
})

test("unprintable dispatch failures reject without occupying the transport slot", async (): Promise<void> => {
  let receive: (message: unknown) => void = () => {}
  let dispatches = 0
  let terminated = 0
  const runtime = new SolverRuntime({
    requireWorker: true,
    createWorker: () => ({
      postMessage: (message) => {
        const request = message as { type: string; id?: number }
        if (request.type === "hello") {
          receive({
            solverRuntime: 1,
            type: "ready",
            names: [SuccessfulSolver.solverName],
          })
        } else if (dispatches++ === 0) {
          throw Object.create(null)
        } else {
          receive({
            solverRuntime: 1,
            type: "output",
            id: request.id,
            output: 42,
          })
        }
      },
      onMessage: (listener) => {
        receive = listener
        return () => {}
      },
      onError: () => () => {},
      terminate: () => {
        terminated++
      },
    }),
  })
  try {
    expect(
      (await getRejection(runtime.executeAsync(SuccessfulSolver, undefined)))
        .message,
    ).toBe(fallbackMessage)
    expect(await runtime.executeAsync(SuccessfulSolver, undefined)).toBe(42)
    expect(dispatches).toBe(2)
  } finally {
    await runtime.dispose()
  }
  expect(terminated).toBe(1)
})
