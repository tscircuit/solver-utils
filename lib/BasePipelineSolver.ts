import type { GraphicsObject } from "graphics-debug"
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
    const pipelineStageDef = this.pipelineDef[this.currentPipelineStageIndex]
    if (!pipelineStageDef) {
      this.solved = true
      return
    }

    if (this.activeSubSolver) {
      this.activeSubSolver.step()
      if (this.activeSubSolver.solved) {
        this.endTimeOfStage[pipelineStageDef.solverName] = performance.now()
        this.timeSpentOnStage[pipelineStageDef.solverName] =
          this.endTimeOfStage[pipelineStageDef.solverName]! -
          this.startTimeOfStage[pipelineStageDef.solverName]!

        // Automatically store the solver's output
        const output = this.activeSubSolver.getOutput()
        if (output !== null) {
          this.pipelineOutputs[pipelineStageDef.solverName] = output
        }

        pipelineStageDef.onSolved?.(this)
        this.activeSubSolver = null
        this.currentPipelineStageIndex++
      } else if (this.activeSubSolver.failed) {
        this.error = this.activeSubSolver?.error
        this.failed = true
        this.activeSubSolver = null
      }
      return
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

  solveUntilStage(stageName: string) {
    while (
      this.getCurrentStageName().toLowerCase() !== stageName.toLowerCase()
    ) {
      this.step()
      if (this.failed || this.solved) break
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

  override visualize(): GraphicsObject {
    if (!this.solved && this.activeSubSolver) {
      return this.activeSubSolver.visualize()
    }

    const visualizations = this.pipelineDef
      .map((stage, stageIndex) => {
        const solver = (this as any)[stage.solverName]
        const viz = solver?.visualize()
        if (!viz) return null

        for (const rect of viz.rects ?? []) {
          rect.step = stageIndex
        }
        for (const point of viz.points ?? []) {
          point.step = stageIndex
        }
        for (const circle of viz.circles ?? []) {
          circle.step = stageIndex
        }
        for (const text of viz.texts ?? []) {
          text.step = stageIndex
        }
        for (const line of viz.lines ?? []) {
          line.step = stageIndex
        }

        return viz
      })
      .filter(Boolean) as GraphicsObject[]

    if (visualizations.length === 0) {
      return { points: [], rects: [], lines: [], circles: [], texts: [] }
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
