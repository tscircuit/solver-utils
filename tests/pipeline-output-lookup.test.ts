import { expect, test } from "bun:test"
import { BasePipelineSolver } from "../lib/BasePipelineSolver"
import { BaseSolver } from "../lib/BaseSolver"

class EmptyPipeline extends BasePipelineSolver<Record<string, never>> {
  pipelineDef = []
}

class ZeroOutputSolver extends BaseSolver {
  override _step() {
    this.solved = true
  }

  override getOutput() {
    return 0
  }
}

class ZeroOutputPipeline extends BasePipelineSolver<Record<string, never>> {
  zeroSolver?: ZeroOutputSolver

  pipelineDef = [
    {
      solverName: "zeroSolver",
      solverClass: ZeroOutputSolver,
      getConstructorParams: () => [],
    },
  ]
}

for (const name of ["constructor", "toString", "__proto__"]) {
  test(`no output exists for inherited Object property ${name}`, () => {
    const pipeline = new EmptyPipeline({})
    expect(Object.keys(pipeline.getAllOutputs())).toEqual([])
    expect(pipeline.hasStageOutput(name)).toBe(false)
    expect(pipeline.getStageOutput(name)).toBeUndefined()
  })
}

test("missing ordinary stage names still report no output", () => {
  const pipeline = new EmptyPipeline({})
  expect(pipeline.hasStageOutput("zeroSolver")).toBe(false)
  expect(pipeline.getStageOutput("zeroSolver")).toBeUndefined()
})

test("zero-valued completed outputs remain valid", () => {
  const pipeline = new ZeroOutputPipeline({})
  pipeline.solve()
  expect(pipeline.hasStageOutput("zeroSolver")).toBe(true)
  expect(pipeline.getStageOutput<number>("zeroSolver")).toEqual(0)
})
