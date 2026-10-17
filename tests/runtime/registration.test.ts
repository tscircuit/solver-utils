import { expect, test } from "bun:test"
import { BaseSolver, SolverRuntime, type SolverConstructor } from "../../lib"
import { getRejectedError } from "../fixtures/getRejectedError"

test("registration requires an explicit static name independent of constructor names", async (): Promise<void> => {
  class Unnamed extends BaseSolver {}
  class Empty extends BaseSolver {
    static solverName = ""
  }
  class Whitespace extends BaseSolver {
    static solverName = "   "
  }
  class Invalid extends BaseSolver {
    static solverName = 42
  }
  class StableSolver extends BaseSolver {
    static readonly solverName: string = "StableSolver"
    override _step(): void {
      this.solved = true
    }
    override getOutput(): number {
      return 42
    }
  }
  class InheritedName extends StableSolver {}
  for (const Solver of [Unnamed, Empty, Whitespace, Invalid, InheritedName]) {
    const invalid = Solver as unknown as SolverConstructor<unknown, unknown>
    expect(() => SolverRuntime.registerSolver(invalid)).toThrow(
      "own non-empty static solverName",
    )
    const runtime = new SolverRuntime()
    try {
      expect(
        (await getRejectedError(runtime.executeAsync(invalid, {}))).message,
      ).toContain("own non-empty static solverName")
    } finally {
      await runtime.dispose()
    }
  }
  Object.defineProperty(StableSolver, "name", { value: "a" })
  SolverRuntime.registerSolver(StableSolver)
  const runtime = new SolverRuntime()
  try {
    expect(await runtime.executeAsync("StableSolver", {})).toBe(42)
    expect(await runtime.executeAsync(StableSolver, undefined)).toBe(42)
  } finally {
    await runtime.dispose()
  }
})
