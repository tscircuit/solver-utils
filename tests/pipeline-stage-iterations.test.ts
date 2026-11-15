import { expect, test } from "bun:test"
import { BasePipelineSolver } from "../lib/BasePipelineSolver"
import { BaseSolver } from "../lib/BaseSolver"

class CountingSolver extends BaseSolver {
  limit: number

  constructor(limit: number) {
    super()
    this.limit = limit
  }

  override _step() {
    if (this.iterations >= this.limit) this.solved = true
  }
}

class CountingPipeline extends BasePipelineSolver<number[]> {
  pipelineDef = this.inputProblem.map((limit, index) => ({
    solverName: `stage${index}`,
    solverClass: CountingSolver,
    getConstructorParams: () => [limit],
  }))
}

test("completed iterations survive the handoff to an unstarted stage", () => {
  const pipeline = new CountingPipeline([2, 3])
  pipeline.step()
  pipeline.step()
  pipeline.step()

  expect(pipeline.currentPipelineStageIndex).toBe(1)
  expect(pipeline.activeSubSolver).toBe(null)
  const stats = pipeline.getStageStats()
  expect(stats.stage0?.iterations).toBe(2)
  expect(stats.stage0?.completed).toBe(true)
  expect(stats.stage1?.iterations).toBe(0)
  expect(stats.stage1?.completed).toBe(false)
})

test("full completion retains each stage's own iteration count", () => {
  const pipeline = new CountingPipeline([2, 3])
  pipeline.solve()
  const stats = pipeline.getStageStats()
  expect(stats.stage0?.iterations).toBe(2)
  expect(stats.stage1?.iterations).toBe(3)
  expect(stats.stage0?.completed).toBe(true)
  expect(stats.stage1?.completed).toBe(true)

  pipeline.step()
  expect(pipeline.getStageStats()).toEqual(stats)
})

test("unstarted and active stages report their actual work", () => {
  const pipeline = new CountingPipeline([2, 3])
  expect(pipeline.getStageStats().stage0?.iterations).toBe(0)
  expect(pipeline.getStageStats().stage1?.iterations).toBe(0)
  pipeline.step()
  expect(pipeline.getStageStats().stage0?.iterations).toBe(0)
  pipeline.step()
  expect(pipeline.getStageStats().stage0?.iterations).toBe(1)
  expect(pipeline.getStageStats().stage1?.iterations).toBe(0)
})

test("a failed stage retains its iterations without counting future stages", () => {
  class FailingSolver extends CountingSolver {
    override _step() {
      if (this.iterations >= this.limit) {
        this.failed = true
        this.error = "Expected failure"
      }
    }
  }

  const pipeline = new CountingPipeline([2, 3])
  pipeline.pipelineDef[0]!.solverClass = FailingSolver
  pipeline.solve()
  expect(pipeline.failed).toBe(true)
  expect(pipeline.getStageStats().stage0?.iterations).toBe(2)
  expect(pipeline.getStageStats().stage0?.completed).toBe(false)
  expect(pipeline.getStageStats().stage1?.iterations).toBe(0)
})
