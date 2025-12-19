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
  startTimeOfPhase: Record<string, number> = {}
  endTimeOfPhase: Record<string, number> = {}
  timeSpentOnPhase: Record<string, number> = {}
  firstIterationOfPhase: Record<string, number> = {}

  currentPipelineStepIndex = 0
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
    const pipelineStepDef = this.pipelineDef[this.currentPipelineStepIndex]
    if (!pipelineStepDef) {
      this.solved = true
      return
    }

    if (this.activeSubSolver) {
      this.activeSubSolver.step()
      if (this.activeSubSolver.solved) {
        this.endTimeOfPhase[pipelineStepDef.solverName] = performance.now()
        this.timeSpentOnPhase[pipelineStepDef.solverName] =
          this.endTimeOfPhase[pipelineStepDef.solverName]! -
          this.startTimeOfPhase[pipelineStepDef.solverName]!

        // Automatically store the solver's output
        const output = this.activeSubSolver.getOutput()
        if (output !== null) {
          this.pipelineOutputs[pipelineStepDef.solverName] = output
        }

        pipelineStepDef.onSolved?.(this)
        this.activeSubSolver = null
        this.currentPipelineStepIndex++
      } else if (this.activeSubSolver.failed) {
        this.error = this.activeSubSolver?.error
        this.failed = true
        this.activeSubSolver = null
      }
      return
    }

    const constructorParams = pipelineStepDef.getConstructorParams(this)
    this.activeSubSolver = new pipelineStepDef.solverClass(...constructorParams)
    ;(this as any)[pipelineStepDef.solverName] = this.activeSubSolver
    this.timeSpentOnPhase[pipelineStepDef.solverName] = 0
    this.startTimeOfPhase[pipelineStepDef.solverName] = performance.now()
    this.firstIterationOfPhase[pipelineStepDef.solverName] = this.iterations
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
    return this.pipelineDef[this.currentPipelineStepIndex]?.solverName ?? "none"
  }

  getPhaseProgress(): number {
    const totalPhases = this.pipelineDef.length
    if (totalPhases === 0) return 1

    const currentPhaseProgress = this.activeSubSolver?.progress ?? 0
    return (this.currentPipelineStepIndex + currentPhaseProgress) / totalPhases
  }

  getPhaseStats(): Record<
    string,
    {
      timeSpent: number
      iterations: number
      completed: boolean
    }
  > {
    const stats: Record<string, any> = {}

    for (const step of this.pipelineDef) {
      const timeSpent = this.timeSpentOnPhase[step.solverName] || 0
      const firstIteration = this.firstIterationOfPhase[step.solverName] || 0
      const currentIteration = this.iterations
      const iterations =
        step.solverName === this.getCurrentStageName()
          ? currentIteration - firstIteration
          : 0
      const completed =
        this.currentPipelineStepIndex >
        this.pipelineDef.findIndex((s) => s.solverName === step.solverName)

      stats[step.solverName] = {
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
      .map((step, stepIndex) => {
        const solver = (this as any)[step.solverName]
        const viz = solver?.visualize()
        if (!viz) return null

        for (const rect of viz.rects ?? []) {
          rect.step = stepIndex
        }
        for (const point of viz.points ?? []) {
          point.step = stepIndex
        }
        for (const circle of viz.circles ?? []) {
          circle.step = stepIndex
        }
        for (const text of viz.texts ?? []) {
          text.step = stepIndex
        }
        for (const line of viz.lines ?? []) {
          line.step = stepIndex
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
    return this.getPhaseProgress()
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
