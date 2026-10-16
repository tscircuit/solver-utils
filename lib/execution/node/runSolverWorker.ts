import { parentPort } from "node:worker_threads"
import type { SolverTaskCatalog, SolverTaskContext } from "../SolverExecutor"
import type { SolverTaskHandlers } from "../SolverTaskHandlers"
import {
  SOLVER_WORKER_PROTOCOL_VERSION,
  type SolverWorkerExecuteMessage,
  type SolverWorkerResponseMessage,
} from "./solverWorkerProtocol"
import { serializeSolverTaskError } from "./solverTaskError"

let initialized = false

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function assertExecuteMessage(
  value: unknown,
): asserts value is SolverWorkerExecuteMessage {
  if (
    !isRecord(value) ||
    value.type !== "execute" ||
    value.protocolVersion !== SOLVER_WORKER_PROTOCOL_VERSION ||
    typeof value.id !== "number" ||
    !Number.isSafeInteger(value.id) ||
    value.id < 0 ||
    typeof value.kind !== "string" ||
    !Object.hasOwn(value, "input") ||
    !isRecord(value.context) ||
    !Object.hasOwn(value.context, "shared")
  ) {
    throw new Error("Invalid solver worker execute message or protocol version")
  }
}

/**
 * Register a typed task catalog from a Node worker entrypoint, then announce
 * readiness. The host sends one task at a time; overlapping or malformed
 * requests are protocol failures and terminate the worker. Task failures,
 * including results that cannot be structured-cloned, are returned to the host.
 */
export function runSolverWorker<Tasks extends SolverTaskCatalog<Tasks>>(
  handlers: SolverTaskHandlers<Tasks>,
): void {
  if (!parentPort) {
    throw new Error("runSolverWorker must be called inside a worker thread")
  }
  if (initialized) {
    throw new Error("runSolverWorker has already been initialized")
  }
  if (!isRecord(handlers)) {
    throw new TypeError("Solver task handlers must be an object")
  }

  initialized = true
  const registeredHandlers = { ...handlers }
  const port = parentPort
  let running = false
  const send = (message: SolverWorkerResponseMessage) => {
    port.postMessage(message)
  }

  const execute = async (message: SolverWorkerExecuteMessage) => {
    try {
      if (!Object.hasOwn(registeredHandlers, message.kind)) {
        throw new Error(`Unknown solver task kind: ${message.kind}`)
      }
      // The catalog ties each kind to its handler at the public API boundary;
      // runtime input data arrives through the host's structured-clone channel.
      const handler = registeredHandlers[
        message.kind as keyof Tasks & string
      ] as (input: unknown, context: SolverTaskContext<unknown>) => unknown
      if (typeof handler !== "function") {
        throw new Error(`Unknown solver task kind: ${message.kind}`)
      }
      const output = await handler(message.input, message.context)
      send({
        type: "result",
        protocolVersion: SOLVER_WORKER_PROTOCOL_VERSION,
        id: message.id,
        output,
      })
    } catch (error) {
      send({
        type: "error",
        protocolVersion: SOLVER_WORKER_PROTOCOL_VERSION,
        id: message.id,
        error: serializeSolverTaskError(error),
      })
    } finally {
      running = false
    }
  }

  port.on("message", (message: unknown) => {
    assertExecuteMessage(message)
    if (running) {
      throw new Error("Solver worker received overlapping execute messages")
    }
    running = true
    void execute(message)
  })

  send({ type: "ready", protocolVersion: SOLVER_WORKER_PROTOCOL_VERSION })
}
