import { expect, test } from "bun:test"
import type { GraphicsObject } from "graphics-debug"
import { BasePipelineSolver } from "../lib/BasePipelineSolver"
import { BaseSolver } from "../lib/BaseSolver"

const arrowGraphics = (label: string): GraphicsObject => ({
  arrows: [
    {
      start: { x: 1, y: 2 },
      end: { x: 3, y: 4 },
      label,
      color: "red",
      doubleSided: true,
    },
  ],
  points: [{ x: 5, y: 6, label }],
})

class ArrowSolver extends BaseSolver {
  label: string

  constructor(label: string) {
    super()
    this.label = label
  }

  override _step() {
    this.solved = true
  }

  override visualize(): GraphicsObject {
    return arrowGraphics(this.label)
  }
}

class ArrowPipeline extends BasePipelineSolver<string[]> {
  pipelineDef = this.inputProblem.map((solverName) => ({
    solverName,
    solverClass: ArrowSolver,
    getConstructorParams: () => [solverName],
  }))
}

test("combining completed stages preserves arrows and their stage metadata", () => {
  const pipeline = new ArrowPipeline(["first", "second"])
  pipeline.solve()

  const graphics = pipeline.visualize()
  expect(graphics.arrows).toEqual([
    { ...arrowGraphics("first").arrows![0], step: 0 },
    { ...arrowGraphics("second").arrows![0], step: 1 },
  ])
  expect(graphics.points?.map((point) => point.label)).toEqual([
    "first",
    "second",
  ])
})

test("combining initial, stage and final visualizations preserves every arrow", () => {
  class HookPipeline extends ArrowPipeline {
    override initialVisualize(): GraphicsObject {
      return arrowGraphics("initial")
    }

    override finalVisualize(): GraphicsObject {
      return arrowGraphics("final")
    }
  }

  const pipeline = new HookPipeline(["first"])
  pipeline.solve()
  expect(pipeline.visualize().arrows?.map((arrow) => arrow.label)).toEqual([
    "initial",
    "first",
    "final",
  ])
})

test("an active stage still exposes its arrows directly", () => {
  const pipeline = new ArrowPipeline(["first", "second"])
  pipeline.step()
  expect(pipeline.visualize().arrows).toEqual(arrowGraphics("first").arrows)
})

test("a single completed stage still exposes its arrows", () => {
  const pipeline = new ArrowPipeline(["first"])
  pipeline.solve()
  expect(pipeline.visualize().arrows).toEqual([
    { ...arrowGraphics("first").arrows![0], step: 0 },
  ])
})
