import type { SolverWorkerSerializedError } from "./solverWorkerProtocol"

/** Errors cross transports as primitives; causes and custom fields may not clone. */
export function serializeSolverTaskError(
  error: unknown,
): SolverWorkerSerializedError {
  try {
    if (error instanceof Error) {
      return {
        name: typeof error.name === "string" ? error.name : "Error",
        message:
          typeof error.message === "string" ? error.message : "Task failed",
        ...(typeof error.stack === "string" ? { stack: error.stack } : {}),
      }
    }
    return { name: "Error", message: String(error) }
  } catch {
    return { name: "Error", message: "Task threw an unserializable error" }
  }
}

export function deserializeSolverTaskError(
  details: SolverWorkerSerializedError,
): Error {
  const error = new Error(details.message)
  error.name = details.name
  if (details.stack !== undefined) error.stack = details.stack
  return error
}

export function normalizeSolverTaskError(error: unknown): Error {
  return deserializeSolverTaskError(serializeSolverTaskError(error))
}
