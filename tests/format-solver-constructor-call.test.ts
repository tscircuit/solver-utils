import { expect, test } from "bun:test"
import {
  formatNewSolverExpression,
  getConstructorArgumentList,
} from "../lib/format-solver-constructor-call"

test("unpacks constructor-param tuples instead of nesting them", () => {
  expect(getConstructorArgumentList([])).toEqual([])
  expect(getConstructorArgumentList([{ limit: 7 }])).toEqual([{ limit: 7 }])
  expect(getConstructorArgumentList([{ limit: 7 }, 3])).toEqual([
    { limit: 7 },
    3,
  ])
  expect(getConstructorArgumentList([[1, 2, 3]])).toEqual([[1, 2, 3]])
})

test("wraps a legacy plain-object return as a single argument", () => {
  expect(getConstructorArgumentList({ limit: 7 })).toEqual([{ limit: 7 }])
})

test("generated construction spreads tuples into the constructor", () => {
  class ProbeSolver {
    input: { limit: number }
    scale: number | undefined
    constructor(input: { limit: number }, scale?: number) {
      this.input = input
      this.scale = scale
    }
  }

  const cases: Array<{ params: unknown; expected: [unknown, unknown?] }> = [
    { params: [], expected: [undefined, undefined] },
    { params: [{ limit: 7 }], expected: [{ limit: 7 }, undefined] },
    { params: [{ limit: 7 }, 3], expected: [{ limit: 7 }, 3] },
    { params: [[1, 2, 3]], expected: [[1, 2, 3], undefined] },
    { params: { limit: 7 }, expected: [{ limit: 7 }, undefined] },
  ]

  expect(formatNewSolverExpression("ProbeSolver")).toBe(
    "new ProbeSolver(...(Array.isArray(input) ? input : [input]) as any)",
  )

  for (const { params, expected } of cases) {
    const solver = new ProbeSolver(
      ...(getConstructorArgumentList(params) as [
        { limit: number },
        number | undefined,
      ]),
    )
    expect([solver.input, solver.scale] as unknown[]).toEqual(expected)
  }
})
