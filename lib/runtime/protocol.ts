export const SOLVER_RUNTIME_PROTOCOL = 1

export type SolverRequest =
  | { solverRuntime: 1; type: "hello" }
  | {
      solverRuntime: 1
      type: "execute"
      id: number
      name: string
      input: unknown
    }

export type SolverResponse =
  | { solverRuntime: 1; type: "ready"; names: string[] }
  | { solverRuntime: 1; type: "output"; id: number; output: unknown }
  | {
      solverRuntime: 1
      type: "error"
      id: number
      error: SerializedSolverError
    }

export type SerializedSolverError = {
  name: string
  message: string
  stack?: string
}

export function serializeSolverError(error: unknown): SerializedSolverError {
  if (error instanceof Error) {
    return { name: error.name, message: error.message, stack: error.stack }
  }
  return { name: "Error", message: String(error) }
}

export function deserializeSolverError(error: SerializedSolverError): Error {
  const result = new Error(error.message)
  result.name = error.name
  result.stack = error.stack
  return result
}
