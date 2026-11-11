import { describe, expect, test } from "bun:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import ts from "typescript"
import { BaseSolver } from "../lib/BaseSolver"
import {
  DownloadDropdown,
  createPageTsxContent,
  createTestTsContent,
} from "../lib/react/DownloadDropdown"

class ProbeSolver extends BaseSolver {
  receivedArgs: unknown[]
  private serializedParams: unknown

  constructor(...args: unknown[]) {
    super()
    this.receivedArgs = args
    this.serializedParams = args
  }

  withConstructorParams(params: unknown): this {
    this.serializedParams = params
    return this
  }

  override getConstructorParams(): any {
    return this.serializedParams
  }

  override _step() {
    this.solved = true
  }
}

const executeGeneratedPageTemplate = (content: string): ProbeSolver => {
  const withoutImports = content
    .replace(/^import .*$/gm, "")
    .replace(/export const inputProblem/g, "const inputProblem")
    .replace(/export default /g, "const Page = ")

  const transpiled = ts.transpileModule(withoutImports, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ESNext,
      jsx: ts.JsxEmit.React,
    },
  }).outputText

  let capturedSolver: ProbeSolver | undefined
  const GenericSolverDebugger = ({ solver }: { solver: ProbeSolver }) => {
    capturedSolver = solver
    return null
  }
  const useMemo = <T,>(factory: () => T): T => factory()

  const runner = new Function(
    "React",
    "useMemo",
    "GenericSolverDebugger",
    "ProbeSolver",
    "renderToStaticMarkup",
    `${transpiled}\nrenderToStaticMarkup(React.createElement(Page));`,
  )
  runner(
    React,
    useMemo,
    GenericSolverDebugger,
    ProbeSolver,
    renderToStaticMarkup,
  )

  if (!capturedSolver) {
    throw new Error("Generated page template did not instantiate ProbeSolver")
  }
  return capturedSolver
}

const executeGeneratedTestTemplate = (content: string): ProbeSolver => {
  const withoutImports = content.replace(/^import .*$/gm, "")

  const transpiled = ts.transpileModule(withoutImports, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ESNext,
    },
  }).outputText

  let capturedSolver: ProbeSolver | undefined
  const testFn = (_name: string, body: () => void) => body()
  const expectFn = (actual: ProbeSolver) => ({
    toMatchSolverSnapshot: () => {
      capturedSolver = actual
    },
  })

  const patched = transpiled.replace(/import\.meta\.path/g, '"probe.test.ts"')
  const runner = new Function(
    "exports",
    "test",
    "expect",
    "ProbeSolver",
    patched,
  )
  runner({}, testFn, expectFn, ProbeSolver)

  if (!capturedSolver) {
    throw new Error("Generated test template did not instantiate ProbeSolver")
  }
  return capturedSolver
}

const getStrictTypeDiagnostics = (
  fileName: string,
  sourceText: string,
): readonly ts.Diagnostic[] => {
  const compilerOptions: ts.CompilerOptions = {
    strict: true,
    noUncheckedIndexedAccess: true,
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    jsx: ts.JsxEmit.ReactJSX,
    noEmit: true,
    skipLibCheck: true,
  }
  const sourceFile = ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.ESNext,
    true,
    fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const host = ts.createCompilerHost(compilerOptions)
  const originalGetSourceFile = host.getSourceFile.bind(host)
  host.getSourceFile = (name, languageVersion) =>
    name === fileName
      ? sourceFile
      : originalGetSourceFile(name, languageVersion)

  const program = ts.createProgram([fileName], compilerOptions, host)
  return ts.getPreEmitDiagnostics(program, sourceFile)
}

describe("DownloadDropdown templates", () => {
  const cases: Array<{
    label: string
    returnedParams: unknown
    expectedArgs: unknown[]
  }> = [
    {
      label: "empty tuple []",
      returnedParams: [],
      expectedArgs: [],
    },
    {
      label: "single-argument tuple [{ limit: 7 }]",
      returnedParams: [{ limit: 7 }],
      expectedArgs: [{ limit: 7 }],
    },
    {
      label: "multi-argument tuple [{ limit: 7 }, 3]",
      returnedParams: [{ limit: 7 }, 3],
      expectedArgs: [{ limit: 7 }, 3],
    },
    {
      label: "single array argument tuple [[1, 2, 3]]",
      returnedParams: [[1, 2, 3]],
      expectedArgs: [[1, 2, 3]],
    },
    {
      label: "legacy plain-object return { limit: 7 }",
      returnedParams: { limit: 7 },
      expectedArgs: [{ limit: 7 }],
    },
  ]

  for (const { label, returnedParams, expectedArgs } of cases) {
    test(`reconstructs constructor arguments in page.tsx and test.ts for ${label}`, () => {
      const solver = new ProbeSolver().withConstructorParams(returnedParams)

      const pageContent = createPageTsxContent(solver)
      const reconstructedFromPage = executeGeneratedPageTemplate(pageContent)
      expect(reconstructedFromPage.receivedArgs).toEqual(expectedArgs)

      const testContent = createTestTsContent(solver)
      const reconstructedFromTest = executeGeneratedTestTemplate(testContent)
      expect(reconstructedFromTest.receivedArgs).toEqual(expectedArgs)
      expect(reconstructedFromTest.solved).toBe(true)
    })
  }

  test("strips underscore-prefixed properties inside constructor tuples", () => {
    const solver = new ProbeSolver().withConstructorParams([
      { limit: 7, _cachedGrid: [1, 2] },
      3,
    ])

    const reconstructedFromPage = executeGeneratedPageTemplate(
      createPageTsxContent(solver),
    )
    expect(reconstructedFromPage.receivedArgs).toEqual([{ limit: 7 }, 3])

    const reconstructedFromTest = executeGeneratedTestTemplate(
      createTestTsContent(solver),
    )
    expect(reconstructedFromTest.receivedArgs).toEqual([{ limit: 7 }, 3])
  })

  test("emits strict-mode valid TypeScript for zero-arg and multi-arg constructors", () => {
    class TwoArgSolver extends BaseSolver {
      constructor(
        public input: { limit: number },
        public scale: number,
      ) {
        super()
      }
      override getConstructorParams() {
        return [this.input, this.scale]
      }
    }

    class ZeroArgSolver extends BaseSolver {
      override getConstructorParams() {
        return []
      }
    }

    const twoArgTestCode = createTestTsContent(
      new TwoArgSolver({ limit: 7 }, 3),
    )
      .replace(
        /^import \{ TwoArgSolver \}.*$/m,
        "declare class TwoArgSolver { constructor(input: { limit: number }, scale: number); solve(): void }",
      )
      .replace(
        /^import \{ test, expect \}.*$/m,
        "declare function test(name: string, fn: () => void): void; declare function expect(v: unknown): { toMatchSolverSnapshot(p: string): void }; declare const metaPath: string;",
      )
      .replace(/import\.meta\.path/g, "metaPath")

    expect(getStrictTypeDiagnostics("two-arg.test.ts", twoArgTestCode)).toEqual(
      [],
    )

    const zeroArgPageCode = createPageTsxContent(new ZeroArgSolver())
      .replace(
        /^import \{ useMemo \}.*$/m,
        "declare function useMemo<T>(fn: () => T, deps: readonly unknown[]): T;",
      )
      .replace(
        /^import \{ GenericSolverDebugger \}.*$/m,
        "declare function GenericSolverDebugger(props: { solver: ZeroArgSolver }): null;",
      )
      .replace(
        /^import \{ ZeroArgSolver \}.*$/m,
        "declare class ZeroArgSolver { constructor() }",
      )

    expect(
      getStrictTypeDiagnostics("zero-arg.page.tsx", zeroArgPageCode),
    ).toEqual([])
  })

  test("renders DownloadDropdown trigger with solver name", () => {
    const solver = new ProbeSolver({ limit: 7 }, 3)
    const html = renderToStaticMarkup(<DownloadDropdown solver={solver} />)
    expect(html).toContain("ProbeSolver")
  })
})
