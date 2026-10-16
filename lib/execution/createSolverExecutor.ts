import type { SolverExecutor, SolverTaskCatalog } from "./SolverExecutor"
import type { SolverTaskHandlers } from "./SolverTaskHandlers"
import { createInlineSolverExecutor } from "./createInlineSolverExecutor"
import { isNodeRuntime } from "./isNodeRuntime"

export type SolverExecutorOptions<Tasks extends SolverTaskCatalog<Tasks>> = {
  /** Same task implementations used inline and registered by the worker module. */
  handlers: SolverTaskHandlers<Tasks>
  /** Module registering handlers with runSolverWorker; only loaded in Node. */
  workerUrl?: string | URL
  /** Maximum concurrent Node worker tasks. Defaults to 2. */
  workers?: number
  /** Node worker readiness deadline, not a task computation budget. */
  startupTimeoutMs?: number
}

/**
 * Use a persistent pool in Node when a worker module is supplied, otherwise
 * execute inline. Importing this API never loads native Node modules.
 */
export async function createSolverExecutor<
  Tasks extends SolverTaskCatalog<Tasks>,
>(options: SolverExecutorOptions<Tasks>): Promise<SolverExecutor<Tasks>> {
  const workers = options.workers ?? 2
  if (!Number.isSafeInteger(workers) || workers < 1) {
    throw new RangeError("Solver worker count must be a positive integer")
  }
  const timeout = options.startupTimeoutMs ?? 30_000
  if (!Number.isFinite(timeout) || timeout <= 0 || timeout > 2_147_483_647) {
    throw new RangeError(
      "Solver worker startup timeout must be between 0 and 2147483647 ms",
    )
  }
  // Validate and snapshot the registry consistently in either environment.
  const inline = createInlineSolverExecutor<Tasks>(options.handlers)
  if (!isNodeRuntime() || options.workerUrl === undefined) return inline

  const workerUrl =
    options.workerUrl instanceof URL
      ? new URL(options.workerUrl.href)
      : options.workerUrl
  const { createNodeSolverExecutor } = await import(
    "./node/createNodeSolverExecutor"
  )
  return createNodeSolverExecutor<Tasks>({
    workerUrl,
    workers,
    startupTimeoutMs: timeout,
  })
}
