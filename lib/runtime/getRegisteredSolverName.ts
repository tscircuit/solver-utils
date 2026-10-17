import type { SolverConstructor } from "./types"

/** Require an explicit stable name, including on subclasses, after minification. */
export function getRegisteredSolverName(
  Solver: SolverConstructor<any, unknown>,
): string {
  if (
    !Object.hasOwn(Solver, "solverName") ||
    typeof Solver.solverName !== "string" ||
    Solver.solverName.trim().length === 0
  ) {
    throw new Error("Solver must define its own non-empty static solverName")
  }
  return Solver.solverName
}
