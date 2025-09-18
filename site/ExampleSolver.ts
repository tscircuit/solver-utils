import { BaseSolver } from "../lib/BaseSolver"
import type { GraphicsObject } from "graphics-debug"

/**
 * Example solver that demonstrates a simple optimization problem:
 * Finding the optimal position for a point that minimizes distance to a set of target points
 */
export class ExampleSolver extends BaseSolver {
  private currentPosition: { x: number; y: number }
  private targetPoints: { x: number; y: number; label: string }[]
  private bestPosition: { x: number; y: number }
  private bestDistance: number
  private step_size: number

  constructor() {
    super()
    this.MAX_ITERATIONS = 1000

    // Initialize with some target points
    this.targetPoints = [
      { x: 10, y: 5, label: "Target A" },
      { x: -5, y: 8, label: "Target B" },
      { x: 3, y: -10, label: "Target C" },
      { x: -8, y: -3, label: "Target D" },
    ]

    // Start at origin
    this.currentPosition = { x: 0, y: 0 }
    this.bestPosition = { x: 0, y: 0 }
    this.bestDistance = this.calculateTotalDistance(this.currentPosition)
    this.step_size = 2.0
  }

  override _step() {
    // Try small perturbations in random directions
    const angle = Math.random() * 2 * Math.PI
    const testPosition = {
      x: this.currentPosition.x + Math.cos(angle) * this.step_size,
      y: this.currentPosition.y + Math.sin(angle) * this.step_size,
    }

    const testDistance = this.calculateTotalDistance(testPosition)

    // Accept if better (greedy approach)
    if (testDistance < this.bestDistance) {
      this.currentPosition = testPosition
      this.bestPosition = { ...testPosition }
      this.bestDistance = testDistance
    } else {
      // Random walk with probability based on temperature
      const temperature = Math.max(
        0.1,
        1.0 - this.iterations / this.MAX_ITERATIONS,
      )
      if (Math.random() < temperature * 0.1) {
        this.currentPosition = testPosition
      }
    }

    // Update stats
    this.stats = {
      currentDistance: this.calculateTotalDistance(this.currentPosition),
      bestDistance: this.bestDistance,
      temperature: Math.max(0.1, 1.0 - this.iterations / this.MAX_ITERATIONS),
      stepSize: this.step_size,
    }

    // Gradually reduce step size
    this.step_size *= 0.999

    // Check for convergence
    if (this.iterations > 100 && this.bestDistance < 0.1) {
      this.solved = true
    }
  }

  private calculateTotalDistance(pos: { x: number; y: number }): number {
    return this.targetPoints.reduce((total, target) => {
      const dx = pos.x - target.x
      const dy = pos.y - target.y
      return total + Math.sqrt(dx * dx + dy * dy)
    }, 0)
  }

  override visualize(): GraphicsObject {
    const graphics: GraphicsObject = {
      points: [],
      lines: [],
      rects: [],
      circles: [],
      texts: [],
    }

    // Draw target points
    for (const target of this.targetPoints) {
      graphics.points!.push({
        x: target.x,
        y: target.y,
        color: "red",
        label: target.label,
      })
    }

    // Draw current position
    graphics.points!.push({
      x: this.currentPosition.x,
      y: this.currentPosition.y,
      color: this.solved ? "green" : "blue",
      label: `Current (${this.currentPosition.x.toFixed(1)}, ${this.currentPosition.y.toFixed(1)})`,
    })

    // Draw best position if different from current
    if (
      Math.abs(this.bestPosition.x - this.currentPosition.x) > 0.1 ||
      Math.abs(this.bestPosition.y - this.currentPosition.y) > 0.1
    ) {
      graphics.points!.push({
        x: this.bestPosition.x,
        y: this.bestPosition.y,
        color: "orange",
        label: `Best (${this.bestPosition.x.toFixed(1)}, ${this.bestPosition.y.toFixed(1)})`,
      })
    }

    // Draw lines from current position to all targets
    for (const target of this.targetPoints) {
      graphics.lines!.push({
        points: [
          {
            x: this.currentPosition.x,
            y: this.currentPosition.y,
          },
          {
            x: target.x,
            y: target.y,
          },
        ],
        strokeColor: "gray",
        strokeWidth: 1,
      })
    }

    // Add status text
    graphics.texts!.push({
      x: -15,
      y: 15,
      text: `Iteration: ${this.iterations}`,
      fontSize: 12,
      color: "black",
    })

    graphics.texts!.push({
      x: -15,
      y: 12,
      text: `Distance: ${this.stats.currentDistance?.toFixed(2) || "N/A"}`,
      fontSize: 12,
      color: "black",
    })

    if (this.solved) {
      graphics.texts!.push({
        x: -15,
        y: 9,
        text: "🎉 SOLVED!",
        fontSize: 14,
        color: "green",
      })
    }

    return graphics
  }

  override getConstructorParams() {
    return []
  }
}
