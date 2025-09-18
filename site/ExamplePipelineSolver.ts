import {
  BasePipelineSolver,
  definePipelineStep,
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
 * Second stage: Fine positioning using small steps
 */
class FinePositioningSolver extends BaseSolver {
  private currentX: number
  private currentY: number
  private stepSize = 0.5

  constructor(
    private problem: OptimizationProblem,
    startPosition: { x: number; y: number },
  ) {
    super()
    this.currentX = startPosition.x
    this.currentY = startPosition.y
    this.MAX_ITERATIONS = 100
  }

  override _step() {
    // Fine-tuned positioning with small random perturbations
    const dx = this.problem.targetX - this.currentX
    const dy = this.problem.targetY - this.currentY
    const distance = Math.sqrt(dx * dx + dy * dy)

    if (distance < 0.1) {
      this.solved = true
      return
    }

    // Add some random exploration
    const randomAngle = Math.random() * 2 * Math.PI
    const explorationStrength = 0.2

    const moveX =
      (dx / (distance + 0.001)) * this.stepSize +
      Math.cos(randomAngle) * this.stepSize * explorationStrength
    const moveY =
      (dy / (distance + 0.001)) * this.stepSize +
      Math.sin(randomAngle) * this.stepSize * explorationStrength

    this.currentX += moveX
    this.currentY += moveY

    this.stats = {
      currentX: this.currentX,
      currentY: this.currentY,
      distanceToTarget: distance,
      stepSize: this.stepSize,
    }

    // Gradually reduce step size
    this.stepSize *= 0.99
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
          color: "green",
          label: `Fine (${this.currentX.toFixed(2)}, ${this.currentY.toFixed(2)})`,
        },
      ],
      lines: [
        {
          points: [
            {
              x: this.currentX,
              y: this.currentY,
            },
            {
              x: this.problem.targetX,
              y: this.problem.targetY,
            },
          ],
          strokeColor: "green",
          strokeWidth: 1,
        },
      ],
      texts: [
        {
          x: -15,
          y: 15,
          text: `Phase 2: Fine Positioning`,
          fontSize: 14,
          color: "green",
        },
        {
          x: -15,
          y: 12,
          text: `Distance: ${this.stats.distanceToTarget?.toFixed(3) || "N/A"}`,
          fontSize: 12,
          color: "black",
        },
      ],
      rects: [],
      circles: [],
    }
  }

  override getConstructorParams() {
    return [this.problem, { x: this.currentX, y: this.currentY }]
  }
}

/**
 * Example pipeline solver demonstrating multi-stage optimization
 */
export class ExamplePipelineSolver extends BasePipelineSolver<OptimizationProblem> {
  coarsePositioningSolver?: CoarsePositioningSolver
  finePositioningSolver?: FinePositioningSolver

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
      "finePositioningSolver",
      FinePositioningSolver,
      (instance) => [
        instance.inputProblem,
        instance
          .getSolver<CoarsePositioningSolver>("coarsePositioningSolver")!
          .getFinalPosition(),
      ],
      {
        onSolved: (instance) => {
          console.log("Fine positioning completed - pipeline solved!")
        },
      },
    ),
  ]

  override getConstructorParams() {
    return [this.inputProblem]
  }
}
