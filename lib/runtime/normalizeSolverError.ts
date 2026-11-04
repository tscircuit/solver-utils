/** Error reporting must not strand requests when a thrown value resists coercion. */
export function normalizeSolverError(error: unknown): Error {
  try {
    return error instanceof Error ? error : new Error(String(error))
  } catch {
    return new Error(
      "Solver threw a value that could not be converted to a string",
    )
  }
}
