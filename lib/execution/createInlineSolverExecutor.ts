import type {
  SolverExecutor,
  SolverTaskCatalog,
  SolverTaskContext,
} from "./SolverExecutor"
import type { SolverTaskHandlers } from "./SolverTaskHandlers"
import { cloneSolverData } from "./cloneSolverData"
import { normalizeSolverTaskError } from "./solverTaskError"

/**
 * Execute registered handlers in this thread with native worker data isolation.
 * Shared memory remains shared; each handler owns its ordinary mutable state.
 */
export function createInlineSolverExecutor<
  Tasks extends SolverTaskCatalog<Tasks>,
>(handlers: SolverTaskHandlers<Tasks>): SolverExecutor<Tasks> {
  if (
    typeof handlers !== "object" ||
    handlers === null ||
    Array.isArray(handlers)
  ) {
    throw new TypeError("Solver task handlers must be an object")
  }
  const registeredHandlers = { ...handlers }
  const pending = new Set<Promise<unknown>>()
  let closed = false
  let disposal: Promise<void> | undefined

  async function run<Kind extends keyof Tasks & string>(
    kind: Kind,
    input: Tasks[Kind]["input"],
    context: SolverTaskContext<Tasks[Kind]["shared"]>,
  ): Promise<Tasks[Kind]["output"]> {
    try {
      if (
        !Object.hasOwn(registeredHandlers, kind) ||
        typeof registeredHandlers[kind] !== "function"
      ) {
        throw new Error(`Unknown solver task kind: ${kind}`)
      }
      const cloned = await cloneSolverData({ input, context })
      const result = await registeredHandlers[kind](
        cloned.input,
        cloned.context,
      )
      return await cloneSolverData(result)
    } catch (error) {
      throw normalizeSolverTaskError(error)
    }
  }

  return {
    execute(kind, input, context) {
      if (closed) {
        return Promise.reject(new Error("Solver executor has been disposed"))
      }
      if (
        typeof kind !== "string" ||
        typeof context !== "object" ||
        context === null ||
        Array.isArray(context) ||
        !Object.hasOwn(context, "shared")
      ) {
        return Promise.reject(
          new TypeError("Solver task requires a kind and shared context"),
        )
      }
      const operation = run(kind, input, context)
      pending.add(operation)
      void operation.then(
        () => pending.delete(operation),
        () => pending.delete(operation),
      )
      return operation
    },
    dispose() {
      if (!disposal) {
        closed = true
        disposal = Promise.allSettled(pending).then(() => undefined)
      }
      return disposal
    },
  }
}
