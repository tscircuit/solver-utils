import { expect, test } from "bun:test"
import {
  BasePipelineSolver,
  definePipelineStep,
} from "../lib/BasePipelineSolver"
import { BaseSolver } from "../lib/BaseSolver"

class EmptyPipeline extends BasePipelineSolver<Record<string, never>> {
  pipelineDef = []
}

class ConstantOutputSolver<T> extends BaseSolver {
  constructor(private readonly value: T) {
    super()
  }

  override _step() {
    this.solved = true
  }

  override getOutput(): T {
    return this.value
  }
}

test("BasePipelineSolver ignores inherited Object.prototype keys before any stage runs", () => {
  const pipeline = new EmptyPipeline({})

  expect(Object.keys(pipeline.getAllOutputs())).toEqual([])

  for (const inheritedName of [
    "constructor",
    "toString",
    "valueOf",
    "hasOwnProperty",
    "__proto__",
  ]) {
    expect(pipeline.hasStageOutput(inheritedName)).toBe(false)
    expect(pipeline.getStageOutput(inheritedName)).toBeUndefined()
  }

  expect(pipeline.hasStageOutput("missingStage")).toBe(false)
  expect(pipeline.getStageOutput("missingStage")).toBeUndefined()
})

test("BasePipelineSolver still ignores inherited keys when a subclass resets pipelineOutputs to {}", () => {
  const pipeline = new EmptyPipeline({})
  pipeline.pipelineOutputs = {}

  for (const inheritedName of ["constructor", "toString", "__proto__"]) {
    expect(pipeline.hasStageOutput(inheritedName)).toBe(false)
    expect(pipeline.getStageOutput(inheritedName)).toBeUndefined()
  }
})

test("BasePipelineSolver preserves falsy and prototype-named own stage outputs", () => {
  class FalsyAndProtoPipeline extends BasePipelineSolver<null> {
    pipelineDef = [
      definePipelineStep("zeroStage", ConstantOutputSolver<number>, () => [0]),
      definePipelineStep("falseStage", ConstantOutputSolver<boolean>, () => [
        false,
      ]),
      definePipelineStep("emptyStage", ConstantOutputSolver<string>, () => [
        "",
      ]),
      definePipelineStep("constructor", ConstantOutputSolver<number>, () => [
        42,
      ]),
      definePipelineStep("__proto__", ConstantOutputSolver<string>, () => [
        "own-proto-value",
      ]),
    ]
  }

  const pipeline = new FalsyAndProtoPipeline(null)
  pipeline.solve()

  expect(pipeline.solved).toBe(true)
  expect(pipeline.hasStageOutput("zeroStage")).toBe(true)
  expect(pipeline.getStageOutput("zeroStage")).toBe(0)
  expect(pipeline.hasStageOutput("falseStage")).toBe(true)
  expect(pipeline.getStageOutput("falseStage")).toBe(false)
  expect(pipeline.hasStageOutput("emptyStage")).toBe(true)
  expect(pipeline.getStageOutput("emptyStage")).toBe("")
  expect(pipeline.hasStageOutput("constructor")).toBe(true)
  expect(pipeline.getStageOutput("constructor")).toBe(42)
  expect(pipeline.hasStageOutput("__proto__")).toBe(true)
  expect(pipeline.getStageOutput("__proto__")).toBe("own-proto-value")
  expect(pipeline.hasStageOutput("toString")).toBe(false)
  expect(pipeline.getStageOutput("toString")).toBeUndefined()
})
