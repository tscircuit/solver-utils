import { expect, test, describe, afterEach } from "bun:test"
import { BaseSolver } from "../lib/BaseSolver"
import {
  resolvePageDownloadConfig,
  resolveTestDownloadConfig,
  resetSolverDownloadGenerators,
  setSolverPageDownloadGenerator,
  setSolverTestDownloadGenerator,
} from "../lib/react/solverDownloadOverrides"
import { sanitizeConstructorParams } from "../lib/react/solverDownloadUtils"

describe("solver download overrides", () => {
  afterEach(() => {
    resetSolverDownloadGenerators()
  })

  class DemoSolver extends BaseSolver {
    constructor(private readonly params: Record<string, unknown>) {
      super()
    }

    override _step() {}

    override getConstructorParams() {
      return this.params
    }
  }

  const createSolver = () =>
    new DemoSolver({
      publicValue: 42,
      _private: "ignore-me",
      nested: { value: 10, _secret: true },
    })

  test("uses default filenames and contents when no override is set", () => {
    const solver = createSolver()
    const raw = solver.getConstructorParams()
    const sanitized = sanitizeConstructorParams(raw)

    const pageConfig = resolvePageDownloadConfig({
      solver,
      constructorParams: sanitized,
      rawConstructorParams: raw,
      defaultFilename: "DemoSolver.page.tsx",
      defaultContents: "// default page",
    })

    expect(pageConfig).toEqual({
      filename: "DemoSolver.page.tsx",
      contents: "// default page",
    })

    const testConfig = resolveTestDownloadConfig({
      solver,
      constructorParams: sanitized,
      rawConstructorParams: raw,
      defaultFilename: "DemoSolver.test.ts",
      defaultContents: "// default test",
    })

    expect(testConfig).toEqual({
      filename: "DemoSolver.test.ts",
      contents: "// default test",
    })
  })

  test("allows overrides to customize filename and contents", () => {
    const solver = createSolver()
    const raw = solver.getConstructorParams()
    const sanitized = sanitizeConstructorParams(raw)

    setSolverPageDownloadGenerator(({ defaultFilename }) => ({
      filename: defaultFilename.replace("DemoSolver", "CustomSolver"),
      contents: "// overridden page",
    }))

    setSolverTestDownloadGenerator(({ constructorParams }) => ({
      contents: JSON.stringify(constructorParams),
    }))

    const pageConfig = resolvePageDownloadConfig({
      solver,
      constructorParams: sanitized,
      rawConstructorParams: raw,
      defaultFilename: "DemoSolver.page.tsx",
      defaultContents: "// default page",
    })

    expect(pageConfig).toEqual({
      filename: "CustomSolver.page.tsx",
      contents: "// overridden page",
    })

    const testConfig = resolveTestDownloadConfig({
      solver,
      constructorParams: sanitized,
      rawConstructorParams: raw,
      defaultFilename: "DemoSolver.test.ts",
      defaultContents: "// default test",
    })

    expect(testConfig).toEqual({
      filename: "DemoSolver.test.ts",
      contents: JSON.stringify({
        publicValue: 42,
        nested: { value: 10 },
      }),
    })
  })
})
