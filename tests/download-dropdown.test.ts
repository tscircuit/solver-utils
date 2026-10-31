import { describe, expect, test } from "bun:test"
import { BaseSolver } from "../lib/BaseSolver"
import {
  getPageTsxContent,
  getTestTsContent,
} from "../lib/react/DownloadDropdown"

class ProbeSolver extends BaseSolver {
  receivedArgs: any[]
  paramsToReturn: any

  constructor(...args: any[]) {
    super()
    this.receivedArgs = args
  }

  override getConstructorParams() {
    return this.paramsToReturn
  }

  override _step() {
    this.solved = true
  }
}

const evaluateGeneratedPageArgs = (pageText: string): any[] => {
  const inputMatch = pageText.match(
    /export const inputProblem = ([\s\S]*?)\n\nexport default/,
  )
  const callMatch = pageText.match(/return new ProbeSolver\((.*)\)/)
  if (!inputMatch || !callMatch) {
    throw new Error(`Unexpected page template:\n${pageText}`)
  }
  const fn = new Function(
    "ProbeSolver",
    `const inputProblem = ${inputMatch[1]}; const solver = new ProbeSolver(${callMatch[1]!.replace(/ as any/g, "")}); return solver.receivedArgs;`,
  )
  return fn(ProbeSolver)
}

const evaluateGeneratedTestArgs = (testText: string): any[] => {
  const inputMatch = testText.match(
    /const input = ([\s\S]*?)\n\s*const solver = new ProbeSolver/,
  )
  const callMatch = testText.match(/const solver = new ProbeSolver\((.*)\)/)
  if (!inputMatch || !callMatch) {
    throw new Error(`Unexpected test template:\n${testText}`)
  }
  const fn = new Function(
    "ProbeSolver",
    `const input = ${inputMatch[1]}; const solver = new ProbeSolver(${callMatch[1]!.replace(/ as any/g, "")}); return solver.receivedArgs;`,
  )
  return fn(ProbeSolver)
}

describe("DownloadDropdown constructor argument templates", () => {
  const cases: { name: string; params: any; expectedArgs: any[] }[] = [
    { name: "empty tuple []", params: [], expectedArgs: [] },
    {
      name: "single-element tuple [{ limit: 7 }]",
      params: [{ limit: 7 }],
      expectedArgs: [{ limit: 7 }],
    },
    {
      name: "multi-argument tuple [{ limit: 7 }, 3]",
      params: [{ limit: 7 }, 3],
      expectedArgs: [{ limit: 7 }, 3],
    },
    {
      name: "nested array tuple [[1, 2, 3]]",
      params: [[1, 2, 3]],
      expectedArgs: [[1, 2, 3]],
    },
    {
      name: "legacy plain object { limit: 7 }",
      params: { limit: 7 },
      expectedArgs: [{ limit: 7 }],
    },
  ]

  for (const { name, params, expectedArgs } of cases) {
    test(`reconstructs constructor args for ${name}`, () => {
      const solver = new ProbeSolver()
      solver.paramsToReturn = params

      const pageText = getPageTsxContent(solver)
      const testText = getTestTsContent(solver)

      expect(evaluateGeneratedPageArgs(pageText)).toEqual(expectedArgs)
      expect(evaluateGeneratedTestArgs(testText)).toEqual(expectedArgs)
    })
  }
})
