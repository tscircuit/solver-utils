import { expect, test } from "bun:test"
import type { GraphicsObject } from "graphics-debug"
import { BasePipelineSolver } from "../lib/BasePipelineSolver"

class FinalOnlyPipeline extends BasePipelineSolver<null> {
  pipelineDef = []
  finalVisualizationCalls = 0

  override finalVisualize(): GraphicsObject {
    this.finalVisualizationCalls++
    return { points: [{ x: 3, y: 4, label: "Final result" }] }
  }
}

test("a solved pipeline preserves its final visualization without initial or stage graphics", () => {
  const pipeline = new FinalOnlyPipeline(null)
  pipeline.solve()

  expect(pipeline.solved).toBe(true)
  expect(pipeline.visualize().points).toEqual([
    expect.objectContaining({ x: 3, y: 4, label: "Final result" }),
  ])
  expect(pipeline.finalVisualizationCalls).toBe(1)
})

test("an unsolved pipeline does not show its final visualization", () => {
  const pipeline = new FinalOnlyPipeline(null)

  expect(pipeline.visualize()).toEqual({
    points: [],
    rects: [],
    lines: [],
    circles: [],
    texts: [],
  })
  expect(pipeline.finalVisualizationCalls).toBe(0)
})

test("a solved pipeline without visualization hooks still returns empty graphics", () => {
  class EmptyPipeline extends BasePipelineSolver<null> {
    pipelineDef = []
  }
  const pipeline = new EmptyPipeline(null)
  pipeline.solve()

  expect(pipeline.visualize()).toEqual({
    points: [],
    rects: [],
    lines: [],
    circles: [],
    texts: [],
  })
})
