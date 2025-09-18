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
    MAX_ITERATIONS = 5

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