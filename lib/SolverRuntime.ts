import type {
  SolverExecutor,
  SolverTaskCatalog,
} from "./execution/SolverExecutor"
import type { SolverTaskHandlers } from "./execution/SolverTaskHandlers"
import { createInlineSolverExecutor } from "./execution/createInlineSolverExecutor"
import { createTaskExecutor } from "./execution/createTaskExecutor"

/** Task implementations belong to the solver package, independently of runtime. */
export type SolverTaskModule<Tasks extends SolverTaskCatalog<Tasks>> = {
  handlers: SolverTaskHandlers<Tasks>
  workerUrl?: string | URL
}

/** Implement this contract to supply another execution environment. */
export interface SolverRuntime {
  getExecutor<Tasks extends SolverTaskCatalog<Tasks>>(
    module: SolverTaskModule<Tasks>,
  ): Promise<SolverExecutor<Tasks>>
  /** Stop accepting tasks, drain accepted work, and release owned resources. */
  dispose(): Promise<void>
}

export type SolverOptions = { runtime?: SolverRuntime }

abstract class ManagedSolverRuntime implements SolverRuntime {
  readonly #executors = new Map<object, Promise<SolverExecutor<any>>>()
  #disposed = false
  #disposal?: Promise<void>

  protected abstract createExecutor<Tasks extends SolverTaskCatalog<Tasks>>(
    module: SolverTaskModule<Tasks>,
  ): Promise<SolverExecutor<Tasks>>

  getExecutor<Tasks extends SolverTaskCatalog<Tasks>>(
    module: SolverTaskModule<Tasks>,
  ): Promise<SolverExecutor<Tasks>> {
    if (this.#disposed)
      return Promise.reject(new Error("Solver runtime has been disposed"))
    let executor = this.#executors.get(module)
    if (!executor) {
      executor = this.createExecutor(module).then(
        (created) =>
          ({
            execute: (kind, input, context) => {
              if (this.#disposed)
                return Promise.reject(
                  new Error("Solver runtime has been disposed"),
                )
              return created.execute(kind, input, context)
            },
            dispose: () => created.dispose(),
          }) as SolverExecutor<Tasks>,
      )
      this.#executors.set(module, executor)
    }
    return executor
  }

  dispose(): Promise<void> {
    if (!this.#disposal) {
      this.#disposed = true
      this.#disposal = Promise.allSettled(
        [...this.#executors.values()].map(async (executor) =>
          (await executor).dispose(),
        ),
      ).then((results) => {
        const failure = results.find((result) => result.status === "rejected")
        if (failure?.status === "rejected") throw failure.reason
      })
    }
    return this.#disposal
  }
}

/** Portable, single-threaded execution. This is the default for every solver. */
export class SingleThreadSolverRuntime extends ManagedSolverRuntime {
  protected async createExecutor<Tasks extends SolverTaskCatalog<Tasks>>(
    module: SolverTaskModule<Tasks>,
  ): Promise<SolverExecutor<Tasks>> {
    return createInlineSolverExecutor(module.handlers)
  }
}

export type NodeSolverRuntimeOptions = {
  /** Maximum workers per task module. Defaults to 2; 1 uses inline execution. */
  threads?: number
  /** Worker readiness deadline, not an algorithm computation budget. */
  startupTimeoutMs?: number
}

/** Owns native pools in Node-compatible hosts; falls back to inline in browsers. */
export class NodeSolverRuntime extends ManagedSolverRuntime {
  readonly #threads: number
  readonly #startupTimeoutMs: number

  constructor(options: NodeSolverRuntimeOptions = {}) {
    super()
    this.#threads = options.threads ?? 2
    this.#startupTimeoutMs = options.startupTimeoutMs ?? 30_000
    if (!Number.isSafeInteger(this.#threads) || this.#threads < 1) {
      throw new RangeError("Solver thread count must be a positive integer")
    }
    if (
      !Number.isFinite(this.#startupTimeoutMs) ||
      this.#startupTimeoutMs <= 0 ||
      this.#startupTimeoutMs > 2_147_483_647
    ) {
      throw new RangeError(
        "Solver worker startup timeout must be between 0 and 2147483647 ms",
      )
    }
  }

  protected async createExecutor<Tasks extends SolverTaskCatalog<Tasks>>(
    module: SolverTaskModule<Tasks>,
  ): Promise<SolverExecutor<Tasks>> {
    return createTaskExecutor({
      handlers: module.handlers,
      workerUrl: this.#threads > 1 ? module.workerUrl : undefined,
      workers: this.#threads,
      startupTimeoutMs: this.#startupTimeoutMs,
    })
  }
}

/** Captured by BaseSolver when constructed; replacing it affects new solvers. */
export const SolverRuntime: { defaultRuntime: SolverRuntime } = {
  defaultRuntime: new SingleThreadSolverRuntime(),
}
