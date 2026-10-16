import type { SolverTaskContext } from "../SolverExecutor"

export const SOLVER_WORKER_PROTOCOL_VERSION = 1 as const

export type SolverWorkerExecuteMessage = {
  type: "execute"
  protocolVersion: typeof SOLVER_WORKER_PROTOCOL_VERSION
  id: number
  kind: string
  input: unknown
  context: SolverTaskContext<unknown>
}

export type SolverWorkerReadyMessage = {
  type: "ready"
  protocolVersion: typeof SOLVER_WORKER_PROTOCOL_VERSION
}

export type SolverWorkerResultMessage = {
  type: "result"
  protocolVersion: typeof SOLVER_WORKER_PROTOCOL_VERSION
  id: number
  output: unknown
}

/** Primitive error details only; thrown values and causes may not be cloneable. */
export type SolverWorkerSerializedError = {
  name: string
  message: string
  stack?: string
}

export type SolverWorkerErrorMessage = {
  type: "error"
  protocolVersion: typeof SOLVER_WORKER_PROTOCOL_VERSION
  id: number
  error: SolverWorkerSerializedError
}

export type SolverWorkerRequestMessage = SolverWorkerExecuteMessage

export type SolverWorkerResponseMessage =
  | SolverWorkerReadyMessage
  | SolverWorkerResultMessage
  | SolverWorkerErrorMessage
