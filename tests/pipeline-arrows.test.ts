import { expect, test } from "bun:test"
import type { GraphicsObject } from "graphics-debug"
import { BasePipelineSolver } from "../lib/BasePipelineSolver"
import { BaseSolver } from "../lib/BaseSolver"

const arrowGraphics = (x: number): GraphicsObject => ({
  arrows: [
    {
      start: { x, y: 2 },
      end: { x: x + 1, y: 4 },
      color: "red",
      doubleSided: true,
    },
  ],
  points: [{ x, y: 6, label: String(x) }],
})

// Arrow labels and step metadata are not part of graphics-debug 0.0.76.
const arrowShapes = (graphics: GraphicsObject) =>
  graphics.arrows?.map(({ start, end, color, doubleSided }) => ({
    start,
    end,
    color,
    doubleSided,
  }))

class ArrowSolver extends BaseSolver {
  x: number

  constructor(x: number) {
    super()
    this.x = x
  }

  override _step() {
    this.solved = true
  }

  override visualize(): GraphicsObject {
    return arrowGraphics(this.x)
  }
}

class ArrowPipeline extends BasePipelineSolver<number[]> {
  pipelineDef = this.inputProblem.map((x) => ({
    solverName: `stage${x}`,
    solverClass: ArrowSolver,
    getConstructorParams: () => [x],
  }))
}

test("combining completed stages preserves arrow geometry and styles", () => {
  const pipeline = new ArrowPipeline([1, 2])
  pipeline.solve()

  const graphics = pipeline.visualize()
  expect(arrowShapes(graphics)).toEqual([
    ...arrowShapes(arrowGraphics(1))!,
    ...arrowShapes(arrowGraphics(2))!,
  ])
  expect(graphics.points?.map((point) => point.step)).toEqual([0, 1])
})

test("combining initial, stage and final visualizations preserves every arrow", () => {
  class HookPipeline extends ArrowPipeline {
    override initialVisualize(): GraphicsObject {
      return arrowGraphics(0)
    }

    override finalVisualize(): GraphicsObject {
      return arrowGraphics(3)
    }
  }

  const pipeline = new HookPipeline([1])
  pipeline.solve()
  expect(pipeline.visualize().arrows?.map((arrow) => arrow.start.x)).toEqual([
    0, 1, 3,
  ])
})

test("an active stage still exposes its arrows directly", () => {
  const pipeline = new ArrowPipeline([1, 2])
  pipeline.step()
  expect(arrowShapes(pipeline.visualize())).toEqual(
    arrowShapes(arrowGraphics(1)),
  )
})

test("a single completed stage still exposes its arrows", () => {
  const pipeline = new ArrowPipeline([1])
  pipeline.solve()
  expect(arrowShapes(pipeline.visualize())).toEqual(
    arrowShapes(arrowGraphics(1)),
  )
})
