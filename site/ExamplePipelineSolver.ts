import {
  BasePipelineSolver,
  definePipelineStep,
  type PipelineStep,
} from "../lib/BasePipelineSolver"
import { BaseSolver } from "../lib/BaseSolver"
import type { GraphicsObject } from "graphics-debug"

interface OptimizationProblem {
  targetX: number
  targetY: number
  initialX: number
  initialY: number
}

/**
 * First stage: Rough positioning using large steps
 */
class CoarsePositioningSolver extends BaseSolver {
  private currentX: number
  private currentY: number
  private stepSize = 5.0

  constructor(private problem: OptimizationProblem) {
    super()
    this.currentX = problem.initialX
    this.currentY = problem.initialY
    this.MAX_ITERATIONS = 50
  }

  override _step() {
    // Simple gradient descent with large steps
    const dx = this.problem.targetX - this.currentX
    const dy = this.problem.targetY - this.currentY
    const distance = Math.sqrt(dx * dx + dy * dy)

    if (distance < this.stepSize) {
      this.solved = true
      return
    }

    // Move toward target
    this.currentX += (dx / distance) * this.stepSize
    this.currentY += (dy / distance) * this.stepSize

    this.stats = {
      currentX: this.currentX,
      currentY: this.currentY,
      distanceToTarget: distance,
      stepSize: this.stepSize,
    }

    // Reduce step size gradually
    this.stepSize *= 0.95
  }

  override visualize(): GraphicsObject {
    return {
      points: [
        {
          x: this.problem.targetX,
          y: this.problem.targetY,
          color: "red",
          label: "Target",
        },
        {
          x: this.currentX,
          y: this.currentY,
          color: "blue",
          label: `Coarse (${this.currentX.toFixed(1)}, ${this.currentY.toFixed(1)})`,
        },
      ],
      lines: [
        {
          points: [
            { x: this.currentX, y: this.currentY },
            { x: this.problem.targetX, y: this.problem.targetY },
          ],
          strokeColor: "blue",
          strokeWidth: 2,
        },
      ],
      texts: [
        {
          x: -15,
          y: 15,
          text: `Phase 1: Coarse Positioning`,
          fontSize: 14,
          color: "blue",
        },
        {
          x: -15,
          y: 12,
          text: `Distance: ${this.stats.distanceToTarget?.toFixed(2) || "N/A"}`,
          fontSize: 12,
          color: "black",
        },
      ],
      rects: [],
      circles: [],
    }
  }

  override getConstructorParams() {
    return [this.problem]
  }

  getFinalPosition() {
    return { x: this.currentX, y: this.currentY }
  }
}

/**
 * Sub-stage for medium positioning (part of TwoPhaseFineTuningSolver pipeline)
 */
class MediumPositioningSolver extends BaseSolver {
  currentX: number
  currentY: number
  private stepSize = 1.0
  private problem: OptimizationProblem

  constructor(params: {
    problem: OptimizationProblem
    startPosition: { x: number; y: number }
  }) {
    super()
    this.problem = params.problem
    this.currentX = params.startPosition.x
    this.currentY = params.startPosition.y
    this.MAX_ITERATIONS = 50
  }

  override _step() {
    const dx = this.problem.targetX - this.currentX
    const dy = this.problem.targetY - this.currentY
    const distance = Math.sqrt(dx * dx + dy * dy)

    if (distance < 0.5) {
      this.solved = true
      return
    }

    this.currentX += (dx / distance) * this.stepSize
    this.currentY += (dy / distance) * this.stepSize

    this.stats = {
      distanceToTarget: distance.toFixed(2),
    }

    this.stepSize *= 0.97
  }

  override visualize(): GraphicsObject {
    return {
      points: [
        { x: this.problem.targetX, y: this.problem.targetY, color: "red" },
        { x: this.currentX, y: this.currentY, color: "orange" },
      ],
      lines: [],
      texts: [{ x: -15, y: 15, text: "Medium Positioning", color: "orange" }],
      rects: [],
      circles: [],
    }
  }

  override getConstructorParams() {
    return [
      {
        problem: this.problem,
        startPosition: { x: this.currentX, y: this.currentY },
      },
    ]
  }

  getFinalPosition() {
    return { x: this.currentX, y: this.currentY }
  }
}

/**
 * Sub-stage for micro positioning (part of TwoPhaseFineTuningSolver pipeline)
 */
class MicroPositioningSolver extends BaseSolver {
  currentX: number
  currentY: number
  private stepSize = 0.2
  private problem: OptimizationProblem

  constructor(params: {
    problem: OptimizationProblem
    startPosition: { x: number; y: number }
  }) {
    super()
    this.problem = params.problem
    this.currentX = params.startPosition.x
    this.currentY = params.startPosition.y
    this.MAX_ITERATIONS = 50
  }

  override _step() {
    const dx = this.problem.targetX - this.currentX
    const dy = this.problem.targetY - this.currentY
    const distance = Math.sqrt(dx * dx + dy * dy)

    if (distance < 0.1) {
      this.solved = true
      return
    }

    // Add some random exploration
    const randomAngle = Math.random() * 2 * Math.PI
    const explorationStrength = 0.1

    this.currentX +=
      (dx / (distance + 0.001)) * this.stepSize +
      Math.cos(randomAngle) * this.stepSize * explorationStrength
    this.currentY +=
      (dy / (distance + 0.001)) * this.stepSize +
      Math.sin(randomAngle) * this.stepSize * explorationStrength

    this.stats = {
      distanceToTarget: distance.toFixed(3),
    }

    this.stepSize *= 0.98
  }

  override visualize(): GraphicsObject {
    return {
      points: [
        { x: this.problem.targetX, y: this.problem.targetY, color: "red" },
        { x: this.currentX, y: this.currentY, color: "purple" },
      ],
      lines: [],
      texts: [{ x: -15, y: 15, text: "Micro Positioning", color: "purple" }],
      rects: [],
      circles: [],
    }
  }

  override getConstructorParams() {
    return [
      {
        problem: this.problem,
        startPosition: { x: this.currentX, y: this.currentY },
      },
    ]
  }

  getFinalPosition() {
    return { x: this.currentX, y: this.currentY }
  }
}

interface FineTuningInput {
  problem: OptimizationProblem
  startPosition: { x: number; y: number }
}

/**
 * Second stage: A nested pipeline solver for fine positioning
 * This demonstrates pipelines within pipelines
 */
class TwoPhaseFineTuningSolver extends BasePipelineSolver<FineTuningInput> {
  mediumPositioningSolver?: MediumPositioningSolver
  microPositioningSolver?: MicroPositioningSolver

  pipelineDef: PipelineStep<any>[] = [
    definePipelineStep(
      "mediumPositioningSolver",
      MediumPositioningSolver,
      (instance: TwoPhaseFineTuningSolver) => [
        {
          problem: instance.inputProblem.problem,
          startPosition: instance.inputProblem.startPosition,
        },
      ],
    ),
    definePipelineStep(
      "microPositioningSolver",
      MicroPositioningSolver,
      (instance: TwoPhaseFineTuningSolver) => [
        {
          problem: instance.inputProblem.problem,
          startPosition: instance
            .getSolver<MediumPositioningSolver>("mediumPositioningSolver")!
            .getFinalPosition(),
        },
      ],
    ),
  ]

  override getConstructorParams() {
    return [this.inputProblem]
  }

  getFinalPosition() {
    return (
      this.microPositioningSolver?.getFinalPosition() ??
      this.inputProblem.startPosition
    )
  }
}

/**
 * Example pipeline solver demonstrating multi-stage optimization
 * with a nested pipeline as one of the stages
 */
export class ExamplePipelineSolver extends BasePipelineSolver<OptimizationProblem> {
  coarsePositioningSolver?: CoarsePositioningSolver
  fineTuningSolver?: TwoPhaseFineTuningSolver

  pipelineDef = [
    definePipelineStep(
      "coarsePositioningSolver",
      CoarsePositioningSolver,
      (instance) => [instance.inputProblem],
      {
        onSolved: (instance) => {
          console.log("Coarse positioning completed")
        },
      },
    ),
    definePipelineStep(
      "fineTuningSolver",
      TwoPhaseFineTuningSolver,
      (instance) => [
        {
          problem: instance.inputProblem,
          startPosition: instance
            .getSolver<CoarsePositioningSolver>("coarsePositioningSolver")!
            .getFinalPosition(),
        },
      ],
      {
        onSolved: (instance) => {
          console.log("Fine tuning pipeline completed - all done!")
        },
      },
    ),
  ]

  override getConstructorParams() {
    return [this.inputProblem]
  }

  override initialVisualize(): GraphicsObject {
    return {
      points: [
        {
          x: this.inputProblem.targetX,
          y: this.inputProblem.targetY,
          color: "red",
          label: "Target",
        },
        {
          x: this.inputProblem.initialX,
          y: this.inputProblem.initialY,
          color: "green",
          label: "Start",
        },
      ],
      lines: [
        {
          points: [
            { x: this.inputProblem.initialX, y: this.inputProblem.initialY },
            { x: this.inputProblem.targetX, y: this.inputProblem.targetY },
          ],
          strokeColor: "gray",
          strokeDash: "5,5",
        },
      ],
      texts: [
        {
          x: -15,
          y: 15,
          text: "Initial State",
          fontSize: 14,
          color: "green",
        },
      ],
      rects: [],
      circles: [],
    }
  }

  override finalVisualize(): GraphicsObject {
    const finalPosition = this.fineTuningSolver?.getFinalPosition() ?? {
      x: this.inputProblem.initialX,
      y: this.inputProblem.initialY,
    }
    const dx = this.inputProblem.targetX - finalPosition.x
    const dy = this.inputProblem.targetY - finalPosition.y
    const finalDistance = Math.sqrt(dx * dx + dy * dy)

    return {
      points: [
        {
          x: this.inputProblem.targetX,
          y: this.inputProblem.targetY,
          color: "red",
          label: "Target",
        },
        {
          x: finalPosition.x,
          y: finalPosition.y,
          color: "green",
          label: `Final (${finalPosition.x.toFixed(2)}, ${finalPosition.y.toFixed(2)})`,
        },
      ],
      lines: [],
      texts: [
        {
          x: -15,
          y: 15,
          text: "Optimization Complete",
          fontSize: 14,
          color: "green",
        },
        {
          x: -15,
          y: 12,
          text: `Final Distance: ${finalDistance.toFixed(4)}`,
          fontSize: 12,
          color: "black",
        },
      ],
      rects: [],
      circles: [
        {
          center: { x: finalPosition.x, y: finalPosition.y },
          radius: 0.5,
          fill: "rgba(0, 255, 0, 0.3)",
          stroke: "green",
        },
      ],
    }
  }
}
