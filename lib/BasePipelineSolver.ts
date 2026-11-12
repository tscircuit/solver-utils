import type { GraphicsObject } from "graphics-debug"
import { setStepOfAllObjects } from "graphics-debug"
import { BaseSolver } from "./BaseSolver"

export interface PipelineStep<T extends BaseSolver> {
  solverName: string
  solverClass: new (...args: any[]) => T
  getConstructorParams: (pipelineInstance: any) => any[]
  onSolved?: (pipelineInstance: any) => void
}

export function definePipelineStep<
  T extends BaseSolver,
  P,
  Instance extends BasePipelineSolver<any>,
>(
  solverName: string,
  solverClass: new (params: P) => T,
  getConstructorParams: (instance: Instance) => [P],
  opts: {
    onSolved?: (instance: Instance) => void
  } = {},
): PipelineStep<T> {
  return {
    solverName,
    solverClass,
    getConstructorParams,
    onSolved: opts.onSolved,
  }
}

export abstract class BasePipelineSolver<TInput> extends BaseSolver {
  startTimeOfStage: Record<string, number> = {}
  endTimeOfStage: Record<string, number> = {}
  timeSpentOnStage: Record<string, number> = {}
  firstIterationOfStage: Record<string, number> = {}

  currentPipelineStageIndex = 0
  inputProblem: TInput

  /** Stores the outputs from each completed pipeline stage */
  pipelineOutputs: Record<string, any> = {}

  abstract pipelineDef: PipelineStep<any>[]

  constructor(inputProblem: TInput) {
    super()
    this.inputProblem = inputProblem
    this.MAX_ITERATIONS = 1e6
  }

  override _step() {
    const stage = this.prepareStage()
    if (!stage) return
    this.activeSubSolver!.step()
    this.finishStage(stage)
  }

  override async _stepAsync(): Promise<void> {
    // Preserve custom synchronous pipeline hooks used by existing subclasses.
    if (this._step !== BasePipelineSolver.prototype._step) {
      await super._stepAsync()
      return
    }
    const stage = this.prepareStage()
    if (!stage) return
    await this.activeSubSolver!.stepAsync()
    this.finishStage(stage)
  }

  protected override assertCanStepSynchronously() {
    // This hook supports both modes; an additional async override is opt-in.
    if (this._stepAsync !== BasePipelineSolver.prototype._stepAsync) {
      super.assertCanStepSynchronously()
    }
  }

  private prepareStage(): PipelineStep<BaseSolver> | undefined {
    const pipelineStageDef = this.pipelineDef[this.currentPipelineStageIndex]
    if (!pipelineStageDef) {
      this.solved = true
      return
    }

    if (this.activeSubSolver) {
      return pipelineStageDef
    }

    const constructorParams = pipelineStageDef.getConstructorParams(this)
    this.activeSubSolver = new pipelineStageDef.solverClass(
      ...constructorParams,
    )
    ;(this as any)[pipelineStageDef.solverName] = this.activeSubSolver
    this.timeSpentOnStage[pipelineStageDef.solverName] = 0
    this.startTimeOfStage[pipelineStageDef.solverName] = performance.now()
    this.firstIterationOfStage[pipelineStageDef.solverName] = this.iterations
  }

  private finishStage(pipelineStageDef: PipelineStep<BaseSolver>) {
    if (this.activeSubSolver!.solved) {
      this.endTimeOfStage[pipelineStageDef.solverName] = performance.now()
      this.timeSpentOnStage[pipelineStageDef.solverName] =
        this.endTimeOfStage[pipelineStageDef.solverName]! -
        this.startTimeOfStage[pipelineStageDef.solverName]!

      // Automatically store the solver's output
      const output = this.activeSubSolver!.getOutput()
      if (output !== null) {
        this.pipelineOutputs[pipelineStageDef.solverName] = output
      }

      pipelineStageDef.onSolved?.(this)
      this.activeSubSolver = null
      this.currentPipelineStageIndex++
    } else if (this.activeSubSolver!.failed) {
      this.error = this.activeSubSolver!.error
      this.failed = true
      this.activeSubSolver = null
    }
  }

  solveUntilStage(stageName: string) {
    while (
      this.getCurrentStageName().toLowerCase() !== stageName.toLowerCase()
    ) {
      this.step()
      if (this.failed || this.solved) break
    }
  }

  /** Like solveUntilStage(), stops before the named stage starts. */
  async solveUntilStageAsync(stageName: string): Promise<void> {
    let lastYield = Date.now()
    while (
      !this.failed &&
      !this.solved &&
      this.getCurrentStageName().toLowerCase() !== stageName.toLowerCase()
    ) {
      await this.stepAsync()
      if (Date.now() - lastYield >= 16) {
        await new Promise((resolve) => setTimeout(resolve, 0))
        lastYield = Date.now()
      }
    }
  }

  getCurrentStageName(): string {
    return (
      this.pipelineDef[this.currentPipelineStageIndex]?.solverName ?? "none"
    )
  }

  getStageProgress(): number {
    const totalStages = this.pipelineDef.length
    if (totalStages === 0) return 1

    const currentStageProgress = this.activeSubSolver?.progress ?? 0
    return (this.currentPipelineStageIndex + currentStageProgress) / totalStages
  }

  getStageStats(): Record<
    string,
    {
      timeSpent: number
      iterations: number
      completed: boolean
    }
  > {
    const stats: Record<string, any> = {}

    for (const stage of this.pipelineDef) {
      const timeSpent = this.timeSpentOnStage[stage.solverName] || 0
      const firstIteration = this.firstIterationOfStage[stage.solverName] || 0
      const currentIteration = this.iterations
      const iterations =
        stage.solverName === this.getCurrentStageName()
          ? currentIteration - firstIteration
          : 0
      const completed =
        this.currentPipelineStageIndex >
        this.pipelineDef.findIndex((s) => s.solverName === stage.solverName)

      stats[stage.solverName] = {
        timeSpent,
        iterations,
        completed,
      }
    }

    return stats
  }

  initialVisualize(): GraphicsObject | null {
    return null
  }
  finalVisualize(): GraphicsObject | null {
    return null
  }

  override visualize(): GraphicsObject {
    if (!this.solved && this.activeSubSolver) {
      return this.activeSubSolver.visualize()
    }

    let stageStepOffset = 0
    const initialVisualization = this.initialVisualize()
    if (initialVisualization) {
      setStepOfAllObjects(initialVisualization, 0)
      stageStepOffset = 1
    }

    let finalVisualization: GraphicsObject | null = null
    if (this.solved) {
      finalVisualization = this.finalVisualize()
    }

    const visualizations = [initialVisualization!].filter(Boolean).concat(
      this.pipelineDef
        .map((stage, stageIndex) => {
          const solver = (this as any)[stage.solverName]
          const viz = solver?.visualize()
          if (!viz) return null

          setStepOfAllObjects(viz, stageIndex + stageStepOffset)

          return viz
        })
        .filter(Boolean) as GraphicsObject[],
    )

    if (visualizations.length === 0) {
      return { points: [], rects: [], lines: [], circles: [], texts: [] }
    }

    if (this.solved && finalVisualization) {
      setStepOfAllObjects(
        finalVisualization,
        visualizations.length + stageStepOffset + 1,
      )
      visualizations.push(finalVisualization)
    }

    if (visualizations.length === 1) {
      return visualizations[0]!
    }

    return {
      points: visualizations.flatMap((v) => v.points || []),
      rects: visualizations.flatMap((v) => v.rects || []),
      lines: visualizations.flatMap((v) => v.lines || []),
      circles: visualizations.flatMap((v) => v.circles || []),
      texts: visualizations.flatMap((v) => v.texts || []),
    }
  }

  override preview(): GraphicsObject {
    if (this.activeSubSolver) {
      return this.activeSubSolver.preview()
    }

    return super.preview()
  }

  computeProgress(): number {
    return this.getStageProgress()
  }

  /**
   * Get the output from a specific pipeline stage
   */
  getStageOutput<T = any>(stageOutput: string): T | undefined {
    return this.pipelineOutputs[stageOutput]
  }

  /**
   * Get all pipeline outputs
   */
  getAllOutputs(): Record<string, any> {
    return { ...this.pipelineOutputs }
  }

  /**
   * Check if a step has completed and produced output
   */
  hasStageOutput(stageName: string): boolean {
    return stageName in this.pipelineOutputs
  }

  /**
   * Get a solver instance by name
   */
  getSolver<T extends BaseSolver>(stageName: string): T | undefined {
    return (this as any)[stageName] as T | undefined
  }
}
