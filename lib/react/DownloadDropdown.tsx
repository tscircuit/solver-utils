import React, { useEffect, useRef, useState } from "react"
import type { BaseSolver } from "../BaseSolver"
import { BasePipelineSolver } from "../BasePipelineSolver"

export interface FileGenerationOptions {
  solver: BaseSolver
  params: any
}

export interface GeneratedFileDescriptor {
  content: string
  fileName?: string
}

export type FileGenerationResult =
  | string
  | GeneratedFileDescriptor
  | null
  | undefined

export interface DownloadGenerators {
  generatePageTsx?: (options: FileGenerationOptions) => FileGenerationResult
  generateTestTs?: (options: FileGenerationOptions) => FileGenerationResult
}

export interface DownloadDropdownProps {
  solver: BaseSolver
  className?: string
  generators?: DownloadGenerators
}

export const deepRemoveUnderscoreProperties = (obj: any): any => {
  if (obj === null || typeof obj !== "object") {
    return obj
  }

  if (Array.isArray(obj)) {
    return obj.map((value) => deepRemoveUnderscoreProperties(value))
  }

  const result: Record<string, any> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (!key.startsWith("_")) {
      result[key] = deepRemoveUnderscoreProperties(value)
    }
  }
  return result
}

const ensureDescriptor = (
  result: FileGenerationResult,
  fallbackFileName: string,
): GeneratedFileDescriptor | null => {
  if (!result) return null
  if (typeof result === "string") {
    return { content: result, fileName: fallbackFileName }
  }
  return {
    fileName: result.fileName ?? fallbackFileName,
    content: result.content,
  }
}

const serializeParamsForConstructor = (
  params: any,
): {
  declaration: string
  instantiationArgs: string
} => {
  const serialized = JSON.stringify(params, null, 2)
  if (Array.isArray(params)) {
    return {
      declaration: `const constructorParams = ${serialized} as const`,
      instantiationArgs: "...(constructorParams as any)",
    }
  }

  return {
    declaration: `const inputParams = ${serialized} as const`,
    instantiationArgs: "inputParams as any",
  }
}

const generateDefaultPageTsx = ({
  solver,
  params,
}: FileGenerationOptions): GeneratedFileDescriptor => {
  const solverName = solver.constructor.name
  const { declaration, instantiationArgs } =
    serializeParamsForConstructor(params)

  if (solver instanceof BasePipelineSolver) {
    const content = `import { useMemo } from "react"
import { PipelineDebugger } from "solver-utils/lib/react"
import { ${solverName} } from "lib/solvers/${solverName}/${solverName}"

${declaration}

export default function ${solverName}PipelineDebuggerPage() {
  const solver = useMemo(
    () => new ${solverName}(${instantiationArgs}),
    [],
  )

  return <PipelineDebugger solver={solver} />
}
`

    return {
      content,
      fileName: `${solverName}.page.tsx`,
    }
  }

  const content = `import { useMemo } from "react"
import { GenericSolverDebugger } from "solver-utils/lib/react"
import { ${solverName} } from "lib/solvers/${solverName}/${solverName}"

${declaration}

export default function ${solverName}DebuggerPage() {
  const solver = useMemo(
    () => new ${solverName}(${instantiationArgs}),
    [],
  )

  return <GenericSolverDebugger solver={solver} />
}
`

  return {
    content,
    fileName: `${solverName}.page.tsx`,
  }
}

const generateDefaultTestTs = ({
  solver,
  params,
}: FileGenerationOptions): GeneratedFileDescriptor => {
  const solverName = solver.constructor.name
  const { declaration, instantiationArgs } =
    serializeParamsForConstructor(params)

  const content = `import { ${solverName} } from "lib/solvers/${solverName}/${solverName}"
import { expect, test } from "bun:test"

${declaration}

test("${solverName} should solve problem correctly", () => {
  const solver = new ${solverName}(${instantiationArgs})
  solver.solve()

  expect(solver).toMatchSolverSnapshot(import.meta.path)

  // Add more specific assertions based on expected output
  // expect(solver.someProperty).toMatchInlineSnapshot()
})
`

  return {
    content,
    fileName: `${solverName}.test.ts`,
  }
}

export const DownloadDropdown = ({
  solver,
  className = "",
  generators,
}: DownloadDropdownProps) => {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const getConstructorParams = () => {
    if (typeof solver.getConstructorParams !== "function") {
      throw new Error(
        `getConstructorParams() is not implemented for ${solver.constructor.name}`,
      )
    }
    return deepRemoveUnderscoreProperties(solver.getConstructorParams())
  }

  const triggerDownload = (descriptor: GeneratedFileDescriptor) => {
    if (typeof window === "undefined") return
    const blob = new Blob([descriptor.content], { type: "text/plain" })
    const url = window.URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = descriptor.fileName ?? "download.txt"
    anchor.click()
    window.URL.revokeObjectURL(url)
  }

  const triggerJsonDownload = (fileName: string, data: any) => {
    if (typeof window === "undefined") return
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    })
    const url = window.URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = fileName
    anchor.click()
    window.URL.revokeObjectURL(url)
  }

  const handleDownloadJSON = () => {
    try {
      const params = getConstructorParams()
      triggerJsonDownload(
        `${solver.constructor.name}_params.json`,
        params,
      )
    } catch (error) {
      window.alert(
        `Error downloading params for ${solver.constructor.name}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
    setIsOpen(false)
  }

  const handleDownloadPage = () => {
    try {
      const params = getConstructorParams()
      const generator = generators?.generatePageTsx ?? generateDefaultPageTsx
      const descriptor = ensureDescriptor(
        generator({ solver, params }),
        `${solver.constructor.name}.page.tsx`,
      )
      if (!descriptor) return
      triggerDownload(descriptor)
    } catch (error) {
      window.alert(
        `Error generating page.tsx for ${solver.constructor.name}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
    setIsOpen(false)
  }

  const handleDownloadTest = () => {
    try {
      const params = getConstructorParams()
      const generator = generators?.generateTestTs ?? generateDefaultTestTs
      const descriptor = ensureDescriptor(
        generator({ solver, params }),
        `${solver.constructor.name}.test.ts`,
      )
      if (!descriptor) return
      triggerDownload(descriptor)
    } catch (error) {
      window.alert(
        `Error generating test.ts for ${solver.constructor.name}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
    setIsOpen(false)
  }

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        className="px-2 py-1 rounded text-xs cursor-pointer border border-gray-300 bg-white hover:bg-gray-50"
        onClick={() => setIsOpen((open) => !open)}
        type="button"
        title={`Download options for ${solver.constructor.name}`}
      >
        {solver.constructor.name}
      </button>

      {isOpen ? (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-300 rounded shadow-lg z-10 min-w-[170px]">
          <button
            className="w-full text-left px-3 py-2 hover:bg-gray-100 text-xs"
            onClick={handleDownloadJSON}
            type="button"
          >
            Download JSON
          </button>
          <button
            className="w-full text-left px-3 py-2 hover:bg-gray-100 text-xs"
            onClick={handleDownloadPage}
            type="button"
          >
            Download page.tsx
          </button>
          <button
            className="w-full text-left px-3 py-2 hover:bg-gray-100 text-xs"
            onClick={handleDownloadTest}
            type="button"
          >
            Download test.ts
          </button>
        </div>
      ) : null}
    </div>
  )
}
