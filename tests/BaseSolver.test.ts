import { test, expect } from "bun:test"
import { BaseSolver } from "../lib/BaseSolver"

class TestSolver extends BaseSolver {
  target = 10
  current = 0

  override _setup() {
    this.current = 0
  }

  override _step() {
    this.current++
    if (this.current >= this.target) {
      this.solved = true
    }
  }

  computeProgress() {
    return this.current / this.target
  }

  override visualize() {
    return {
      points: [{ x: this.current, y: 0 }],
      lines: [
        {
          points: [
            { x: 0, y: 0 },
            { x: this.current, y: 1 },
          ],
          strokeColor: "blue",
        },
      ],
    }
  }
}

test("BaseSolver basic functionality", () => {
  const solver = new TestSolver()
  expect(solver.solved).toBe(false)
  expect(solver.failed).toBe(false)
  expect(solver.iterations).toBe(0)
  expect(solver._setupDone).toBe(false)
})

test("BaseSolver setup and solving", () => {
  const solver = new TestSolver()
  solver.solve()

  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  expect(solver.iterations).toBe(10)
  expect(solver._setupDone).toBe(true)
  expect(solver.current).toBe(10)
  expect(solver.timeToSolve).toBeGreaterThanOrEqual(0)
  expect(solver.progress).toBe(1)
})

test("BaseSolver step-by-step solving", () => {
  const solver = new TestSolver()

  solver.step()
  expect(solver.iterations).toBe(1)
  expect(solver.current).toBe(1)
  expect(solver.solved).toBe(false)
  expect(solver._setupDone).toBe(true)

  solver.step()
  expect(solver.iterations).toBe(2)
  expect(solver.current).toBe(2)
  expect(solver.solved).toBe(false)

  // Continue until solved
  while (!solver.solved && !solver.failed) {
    solver.step()
  }

  expect(solver.solved).toBe(true)
  expect(solver.current).toBe(10)
})

test("BaseSolver visualization", () => {
  const solver = new TestSolver()
  solver.current = 5

  const viz = solver.visualize()
  expect(viz.points).toHaveLength(1)
  expect(viz.points?.[0]).toEqual({ x: 5, y: 0 })
  expect(viz.lines).toHaveLength(1)
  expect(viz.lines?.[0]?.strokeColor).toBe("blue")
})

test("BaseSolver max iterations protection", () => {
  class InfiniteSolver extends BaseSolver {
    override MAX_ITERATIONS = 5

    override _step() {
      // Never set solved = true
    }
  }

  const solver = new InfiniteSolver()
  solver.solve()

  expect(solver.solved).toBe(false)
  expect(solver.failed).toBe(true)
  expect(solver.iterations).toBe(5)
  expect(solver.error).toContain("ran out of iterations")
})

test("BaseSolver error handling", () => {
  class ErrorSolver extends BaseSolver {
    override _step() {
      throw new Error("Test error")
    }
  }

  const solver = new ErrorSolver()
  expect(() => solver.solve()).toThrow("Test error")
  expect(solver.failed).toBe(true)
  expect(solver.error).toContain("ErrorSolver error: Error: Test error")
})

test("async entrypoints preserve sync setup, iterations, progress and acceptance", async () => {
  const sync = new TestSolver()
  const async = new TestSolver()
  sync.solve()
  await async.stepAsync()
  expect(async.current).toBe(1)
  await async.solveAsync()
  expect(async.current).toBe(sync.current)
  expect(async.iterations).toBe(sync.iterations)
  expect(async.progress).toBe(sync.progress)
  expect(async._setupDone).toBe(true)
  expect(async.timeToSolve).toBeGreaterThanOrEqual(0)
  await async.stepAsync()
  expect(async.iterations).toBe(10)

  class AcceptSolver extends BaseSolver {
    override MAX_ITERATIONS = 2
    override tryFinalAcceptance() {
      this.solved = true
    }
  }
  const accepted = new AcceptSolver()
  await accepted.solveAsync()
  expect(accepted.solved).toBe(true)
  expect(accepted.failed).toBe(false)
  expect(accepted.iterations).toBe(2)
  const exhausted = new BaseSolver()
  exhausted.MAX_ITERATIONS = 2
  await exhausted.solveAsync()
  expect(exhausted.failed).toBe(true)
  expect(exhausted.error).toContain("ran out of iterations")
})

test("only one async step runs and concurrent sync/async calls fail immediately", async () => {
  const gate = Promise.withResolvers<void>()
  class SlowSolver extends TestSolver {
    override async _stepAsync() {
      await gate.promise
      this._step()
    }
  }
  const solver = new SlowSolver()
  const pending = solver.stepAsync()
  expect(solver.iterations).toBe(1)
  expect(solver.current).toBe(0)
  await expect(solver.stepAsync()).rejects.toThrow("step in flight")
  await expect(solver.solveAsync()).rejects.toThrow("step in flight")
  expect(() => solver.step()).toThrow("step in flight")
  expect(() => solver.solve()).toThrow("step in flight")
  expect(solver.failed).toBe(false)
  gate.resolve()
  await pending
  expect(solver.current).toBe(1)
  expect(solver.progress).toBe(0.1)
  await solver.solveAsync()
  expect(solver.iterations).toBe(10)
})

test("sync calls on an async hook require the async API without spending iterations", async () => {
  class AsyncSolver extends BaseSolver {
    override async _stepAsync() {
      this.solved = true
    }
  }
  const solver = new AsyncSolver()
  expect(() => solver.step()).toThrow("requires stepAsync() or solveAsync()")
  expect(() => solver.solve()).toThrow("requires stepAsync() or solveAsync()")
  expect(solver.iterations).toBe(0)
  await solver.solveAsync()
  expect(solver.solved).toBe(true)
})

test("async rejection and sync exceptions record the same failed state and do not retry", async () => {
  for (const asyncHook of [false, true]) {
    const error = new Error("external work failed")
    const solver = new BaseSolver()
    if (asyncHook) solver._stepAsync = () => Promise.reject(error)
    else
      solver._step = () => {
        throw error
      }
    await expect(solver.solveAsync()).rejects.toBe(error)
    expect(solver.failed).toBe(true)
    expect(solver.error).toBe("BaseSolver error: Error: external work failed")
    await solver.stepAsync()
    await solver.solveAsync()
    expect(solver.iterations).toBe(1)
  }
})

test("solveAsync yields to timers during long synchronous work", async () => {
  let timerRan = false
  const timer = setTimeout(() => {
    timerRan = true
  }, 0)
  class YieldSolver extends BaseSolver {
    override _step() {
      if (timerRan) this.solved = true
    }
  }
  try {
    const solver = new YieldSolver()
    solver.MAX_ITERATIONS = 1e7
    await solver.solveAsync()
    expect(solver.solved).toBe(true)
    expect(timerRan).toBe(true)
  } finally {
    clearTimeout(timer)
  }
})
