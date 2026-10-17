import type { SolverExecutor, SolverTaskCatalog } from "./SolverExecutor"
import type { SolverTaskHandlers } from "./SolverTaskHandlers"
import { createTaskExecutor } from "./createTaskExecutor"

/** Execution preferences; algorithms and their iteration budgets stay unchanged. */
export type SolverOptions = {
  /** Maximum workers per task module in solveAsync(). One forces inline execution. */
  threads?: number
}

/** Defined by a solver implementation, not supplied by its callers. */
export type SolverTaskModule<Tasks extends SolverTaskCatalog<Tasks>> = {
  handlers: SolverTaskHandlers<Tasks>
  workerUrl?: string | URL
}

/** One solveAsync call owns its resources, including those used by child solvers. */
export class SolverExecutionSession {
  private readonly executors = new Map<object, Promise<SolverExecutor<any>>>()

  constructor(private readonly threads: number) {}

  getExecutor<Tasks extends SolverTaskCatalog<Tasks>>(
    module: SolverTaskModule<Tasks>,
  ): Promise<SolverExecutor<Tasks>> {
    let executor = this.executors.get(module)
    if (!executor) {
      executor = createTaskExecutor<Tasks>({
        handlers: module.handlers,
        workerUrl: this.threads > 1 ? module.workerUrl : undefined,
        workers: this.threads,
      })
      this.executors.set(module, executor)
    }
    return executor
  }

  async dispose(): Promise<void> {
    const results = await Promise.allSettled(
      [...this.executors.values()].map(async (executor) =>
        (await executor).dispose(),
      ),
    )
    const failure = results.find((result) => result.status === "rejected")
    if (failure?.status === "rejected") throw failure.reason
  }
}
