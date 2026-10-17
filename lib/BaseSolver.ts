import type { GraphicsObject } from "graphics-debug"
import type {
  SolverExecutor,
  SolverTaskCatalog,
} from "./execution/SolverExecutor"
import {
  SolverExecutionSession,
  type SolverOptions,
  type SolverTaskModule,
} from "./execution/SolverExecutionSession"

/**
 * A base class for solvers implementing the standard solve() interface.
 *
 * Solvers should override _step() to implement their logic.
 *
 * Solvers should override visualize() to return a GraphicsObject representing
 * the current state of the solver.
 *
 * Solvers should override getConstructorParams() to return the parameters
 * needed to construct the solver.
 */
export class BaseSolver {
  MAX_ITERATIONS = 100e3
  solved = false
  failed = false
  iterations = 0
  progress = 0
  error: string | null = null
  activeSubSolver?: BaseSolver | null
  failedSubSolvers?: BaseSolver[]
  timeToSolve?: number
  stats: Record<string, any> = {}
  _setupDone = false
  readonly #threads: number
  #executionSession?: SolverExecutionSession
  #asyncSolve?: Promise<void>

  constructor(options: SolverOptions = {}) {
    this.#threads = options.threads ?? 2
    if (!Number.isSafeInteger(this.#threads) || this.#threads < 1) {
      throw new RangeError("Solver thread count must be a positive integer")
    }
  }

  getSolverName(): string {
    return this.constructor.name
  }

  setup() {
    if (this._setupDone) return
    this._setup()
    this._setupDone = true
  }

  /** Override this method to perform setup logic */
  _setup() {}

  /** DO NOT OVERRIDE! Override _step() instead */
  step() {
    if (!this._beginStep()) return
    try {
      this._step()
    } catch (e) {
      this.error = `${this.getSolverName()} error: ${e}`
      this.failed = true
      throw e
    }
    this._finishStep()
  }

  private _beginStep(): boolean {
    if (!this._setupDone) this.setup()
    if (this.solved || this.failed) return false
    this.iterations++
    return true
  }

  private _finishStep(): void {
    if (!this.solved && this.iterations >= this.MAX_ITERATIONS) {
      this.tryFinalAcceptance()
    }
    if (!this.solved && this.iterations >= this.MAX_ITERATIONS) {
      this.error = `${this.getSolverName()} ran out of iterations`
      this.failed = true
    }
    if ("computeProgress" in this) {
      // @ts-ignore
      this.progress = this.computeProgress() as number
    }
  }

  /** Override this method to implement solver logic */
  _step() {}

  /** Override only when this solver has deterministic asynchronous work. */
  protected async _stepAsync(): Promise<void> {
    this._step()
  }

  private async _runStepAsync(): Promise<void> {
    // Existing solvers retain their exact step implementation, including any
    // legacy override of step(). No algorithm changes are needed to opt in.
    if (
      this._stepAsync === BaseSolver.prototype._stepAsync ||
      this.step !== BaseSolver.prototype.step
    ) {
      this.step()
      return
    }
    if (!this._beginStep()) return
    try {
      await this._stepAsync()
    } catch (error) {
      this.error = `${this.getSolverName()} error: ${error}`
      this.failed = true
      throw error
    }
    this._finishStep()
  }

  /** Internal task execution; callers still construct and solve this class. */
  protected _getTaskExecutor<Tasks extends SolverTaskCatalog<Tasks>>(
    module: SolverTaskModule<Tasks>,
  ): Promise<SolverExecutor<Tasks>> {
    if (!this.#executionSession) {
      throw new Error("Task execution is only available during solveAsync()")
    }
    return this.#executionSession.getExecutor(module)
  }

  /** Advance a child by one logical step using the parent's execution resources. */
  protected async _stepChildAsync(child: BaseSolver): Promise<void> {
    const previousSession = child.#executionSession
    child.#executionSession = this.#executionSession
    try {
      await child._runStepAsync()
    } finally {
      child.#executionSession = previousSession
    }
  }

  getConstructorParams() {
    throw new Error("getConstructorParams not implemented")
  }

  /**
   * Override this method to return the standardized output of the solver.
   * This method should only be called after the solver has completed successfully.
   * Returns null by default - solvers with outputs should override this method.
   */
  getOutput(): any {
    return null
  }

  solve() {
    const startTime = Date.now()
    while (!this.solved && !this.failed) {
      this.step()
    }
    const endTime = Date.now()
    this.timeToSolve = endTime - startTime
  }

  /**
   * Solve this same instance, using asynchronous work where implemented.
   * Existing solvers run their usual steps. All owned workers are drained and
   * stopped before the promise settles, including when solving fails.
   */
  solveAsync(): Promise<void> {
    if (this.#asyncSolve) return this.#asyncSolve
    const session = new SolverExecutionSession(this.#threads)
    const operation = Promise.resolve().then(async () => {
      const startTime = Date.now()
      this.#executionSession = session
      let solveThrew = false
      try {
        while (!this.solved && !this.failed) await this._runStepAsync()
      } catch (error) {
        solveThrew = true
        throw error
      } finally {
        try {
          await session.dispose()
        } catch (error) {
          if (!solveThrew) {
            this.error = `${this.getSolverName()} error: ${error}`
            this.failed = true
            throw error
          }
        } finally {
          this.#executionSession = undefined
          this.timeToSolve = Date.now() - startTime
        }
      }
    })
    this.#asyncSolve = operation
    void operation.then(
      () => {
        this.#asyncSolve = undefined
      },
      () => {
        this.#asyncSolve = undefined
      },
    )
    return operation
  }

  visualize(): GraphicsObject {
    return {
      lines: [],
      points: [],
      rects: [],
      circles: [],
    }
  }

  /**
   * Called when the solver is about to fail, but we want to see if we have an
   * "acceptable" or "passable" solution. Mostly used for optimizers that
   * have an aggressive early stopping criterion.
   */
  tryFinalAcceptance() {}

  /**
   * A lightweight version of the visualize method that can be used to stream
   * progress
   */
  preview(): GraphicsObject {
    return {
      lines: [],
      points: [],
      rects: [],
      circles: [],
    }
  }
}
