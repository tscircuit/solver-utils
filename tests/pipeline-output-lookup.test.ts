import { expect, test } from "bun:test"
import {
  BasePipelineSolver,
  definePipelineStep,
} from "../lib/BasePipelineSolver"
import { BaseSolver } from "../lib/BaseSolver"

class EmptyPipeline extends BasePipelineSolver<Record<string, never>> {
  pipelineDef = []
}

test.each([
  "constructor",
  "toString",
  "__proto__",
  "hasOwnProperty",
  "valueOf",
  "missingStage",
])("an empty pipeline has no output for %s", (stageName) => {
  const pipeline = new EmptyPipeline({})

  expect(pipeline.getAllOutputs()).toEqual({})
  expect(pipeline.hasStageOutput(stageName)).toBe(false)
  expect(pipeline.getStageOutput(stageName)).toBeUndefined()
})

class ValueSolver extends BaseSolver {
  constructor(private output: unknown) {
    super()
  }

  override _step() {
    this.solved = true
  }

  override getOutput() {
    return this.output
  }
}

class ValuePipeline extends BasePipelineSolver<unknown> {
  pipelineDef = [
    definePipelineStep(
      "valueSolver",
      ValueSolver,
      (pipeline: BasePipelineSolver<unknown>) => [pipeline.inputProblem],
    ),
  ]
}

test.each([0, false, "", undefined])(
  "a completed stage retains its output when the value is %p",
  (output) => {
    const pipeline = new ValuePipeline(output)

    expect(pipeline.hasStageOutput("valueSolver")).toBe(false)
    pipeline.solve()

    expect(pipeline.solved).toBe(true)
    expect(pipeline.hasStageOutput("valueSolver")).toBe(true)
    expect(pipeline.getStageOutput("valueSolver")).toBe(output)
    expect(pipeline.getAllOutputs()).toEqual({ valueSolver: output })
    expect(pipeline.hasStageOutput("toString")).toBe(false)
    expect(pipeline.getStageOutput("toString")).toBeUndefined()
  },
)
