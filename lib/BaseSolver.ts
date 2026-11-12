import type { GraphicsObject } from "graphics-debug"
import type { SolverRuntimeExecutor } from "./runtime/types"

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
  private stepping = false

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
    this.assertNoStepInFlight()
    if (!this.solved && !this.failed) this.assertCanStepSynchronously()
    this.stepping = true
    try {
      if (!this.beginStep()) return
      try {
        this._step()
      } catch (e) {
        this.recordStepError(e)
        throw e
      }
      this.finishStep()
    } finally {
      this.stepping = false
    }
  }

  protected assertCanStepSynchronously() {
    if (this._stepAsync !== BaseSolver.prototype._stepAsync) {
      throw new Error(
        `${this.getSolverName()} requires stepAsync() or solveAsync()`,
      )
    }
  }

  private assertNoStepInFlight() {
    if (this.stepping) {
      throw new Error(`${this.getSolverName()} already has a step in flight`)
    }
  }

  private beginStep(): boolean {
    if (!this._setupDone) {
      this.setup()
    }
    if (this.solved || this.failed) return false
    this.iterations++
    return true
  }

  private recordStepError(e: unknown) {
    this.error = `${this.getSolverName()} error: ${e}`
    this.failed = true
  }

  private finishStep() {
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

  /** Override for a step that awaits external work. Sync solvers need no change. */
  async _stepAsync(): Promise<void> {
    this._step()
  }

  /** Perform one step; overlapping calls reject without advancing or failing it. */
  async stepAsync(): Promise<void> {
    this.assertNoStepInFlight()
    this.stepping = true
    try {
      if (!this.beginStep()) return
      try {
        await this._stepAsync()
      } catch (e) {
        this.recordStepError(e)
        throw e
      }
      this.finishStep()
    } finally {
      this.stepping = false
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
    this.assertNoStepInFlight()
    const startTime = Date.now()
    while (!this.solved && !this.failed) {
      this.step()
    }
    const endTime = Date.now()
    this.timeToSolve = endTime - startTime
  }

  /** Await steps, periodically yielding so timers and debugger rendering can run. */
  async solveAsync(_runtime?: SolverRuntimeExecutor): Promise<void> {
    // Retain the existing SolverRuntime override signature; steps need no executor.
    this.assertNoStepInFlight()
    const startTime = Date.now()
    let lastYield = startTime
    while (!this.solved && !this.failed) {
      await this.stepAsync()
      if (Date.now() - lastYield >= 16) {
        await new Promise((resolve) => setTimeout(resolve, 0))
        lastYield = Date.now()
      }
    }
    this.timeToSolve = Date.now() - startTime
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
