import type { BaseSolver } from "../BaseSolver"

export interface DownloadGeneratorOptions<TSolver extends BaseSolver = BaseSolver> {
  solver: TSolver
  constructorParams: unknown
  rawConstructorParams: unknown
  defaultFilename: string
  defaultContents: string
}

export interface DownloadGeneratorResult {
  filename?: string
  contents?: string
}

export type DownloadGenerator<TSolver extends BaseSolver = BaseSolver> = (
  options: DownloadGeneratorOptions<TSolver>,
) => DownloadGeneratorResult | void | null | undefined

let pageGeneratorOverride: DownloadGenerator | null = null
let testGeneratorOverride: DownloadGenerator | null = null

const applyOverride = (
  override: DownloadGenerator | null,
  options: DownloadGeneratorOptions,
): { filename: string; contents: string } => {
  const resolved = {
    filename: options.defaultFilename,
    contents: options.defaultContents,
  }

  if (!override) {
    return resolved
  }

  const result = override(options)
  if (!result) {
    return resolved
  }

  return {
    filename: result.filename ?? resolved.filename,
    contents: result.contents ?? resolved.contents,
  }
}

export const setSolverPageDownloadGenerator = (
  generator?: DownloadGenerator | null,
) => {
  pageGeneratorOverride = generator ?? null
}

export const setSolverTestDownloadGenerator = (
  generator?: DownloadGenerator | null,
) => {
  testGeneratorOverride = generator ?? null
}

export const resetSolverDownloadGenerators = () => {
  pageGeneratorOverride = null
  testGeneratorOverride = null
}

export const resolvePageDownloadConfig = (
  options: DownloadGeneratorOptions,
): { filename: string; contents: string } => applyOverride(pageGeneratorOverride, options)

export const resolveTestDownloadConfig = (
  options: DownloadGeneratorOptions,
): { filename: string; contents: string } => applyOverride(testGeneratorOverride, options)
