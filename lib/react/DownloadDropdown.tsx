import React, { useEffect, useRef, useState } from "react"
import type { BaseSolver } from "../BaseSolver"
import { BasePipelineSolver } from "../BasePipelineSolver"

export interface DownloadTemplateContext {
  solver: BaseSolver
  solverName: string
  params: any
  isPipelineSolver: boolean
}

export interface DownloadTemplateOverrides {
  generatePageTsxContent?: (context: DownloadTemplateContext) => string
  generateTestTsContent?: (context: DownloadTemplateContext) => string
}

export interface DownloadDropdownProps {
  solver: BaseSolver
  className?: string
  overrides?: DownloadTemplateOverrides
}

export const deepRemoveUnderscoreProperties = (obj: any): any => {
  if (obj === null || typeof obj !== "object") {
    return obj
  }

  if (Array.isArray(obj)) {
    return obj.map(deepRemoveUnderscoreProperties)
  }

  const result: Record<string, any> = {}
  for (const [key, value] of Object.entries(obj)) {
    if (!key.startsWith("_")) {
      result[key] = deepRemoveUnderscoreProperties(value)
    }
  }
  return result
}

const defaultPageTsxContent = ({
  solverName,
  params,
  isPipelineSolver,
}: DownloadTemplateContext) => {
  const serializedParams = JSON.stringify(params, null, 2)

  if (isPipelineSolver) {
    return `import { useMemo } from "react"
import { PipelineDebugger } from "solver-utils/lib/react"
import { ${solverName} } from "lib/solvers/${solverName}/${solverName}"

export const inputProblem = ${serializedParams}

export default () => {
  const solver = useMemo(() => new ${solverName}(inputProblem as any), [])
  return <PipelineDebugger solver={solver} />
}
`
  }

  return `import { useMemo } from "react"
import { GenericSolverDebugger } from "solver-utils/lib/react"
import { ${solverName} } from "lib/solvers/${solverName}/${solverName}"

export const inputProblem = ${serializedParams}

export default () => {
  const solver = useMemo(() => new ${solverName}(inputProblem as any), [])
  return <GenericSolverDebugger solver={solver} />
}
`
}

const defaultTestTsContent = ({ solverName, params }: DownloadTemplateContext) => {
  const serializedParams = JSON.stringify(params, null, 2)

  return `import { ${solverName} } from "lib/solvers/${solverName}/${solverName}"
import { test, expect } from "bun:test"

test("${solverName} should solve problem correctly", () => {
  const input = ${serializedParams}

  const solver = new ${solverName}(input as any)
  solver.solve()

  expect(solver).toMatchSolverSnapshot(import.meta.path)

  // Add more specific assertions based on expected output
  // expect(solver.getOutput()).toMatchInlineSnapshot()
})
`
}

export const DownloadDropdown: React.FC<DownloadDropdownProps> = ({
  solver,
  className = "",
  overrides,
}) => {
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

    if (typeof document !== "undefined") {
      document.addEventListener("mousedown", handleClickOutside)
    }
    return () => {
      if (typeof document !== "undefined") {
        document.removeEventListener("mousedown", handleClickOutside)
      }
    }
  }, [])

  const runWithParams = (
    action: (context: DownloadTemplateContext) => void,
  ) => {
    if (typeof solver.getConstructorParams !== "function") {
      const message = `getConstructorParams() is not implemented for ${solver.constructor.name}`
      if (typeof window !== "undefined") {
        window.alert?.(message)
      } else {
        console.error(message)
      }
      return
    }

    try {
      const rawParams = solver.getConstructorParams()
      const params = deepRemoveUnderscoreProperties(rawParams)
      const solverName = solver.constructor.name
      const context: DownloadTemplateContext = {
        solver,
        solverName,
        params,
        isPipelineSolver: solver instanceof BasePipelineSolver,
      }
      action(context)
    } catch (error) {
      const message = `Error gathering constructor params for ${solver.constructor.name}: ${error instanceof Error ? error.message : String(error)}`
      if (typeof window !== "undefined") {
        window.alert?.(message)
      } else {
        console.error(message)
      }
    }
  }

  const downloadJSON = () => {
    runWithParams(({ solverName, params }) => {
      if (typeof document === "undefined") {
        console.error("Document is not available to trigger downloads")
        return
      }
      const blob = new Blob([JSON.stringify(params, null, 2)], {
        type: "application/json",
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${solverName}_params.json`
      a.click()
      URL.revokeObjectURL(url)
    })
    setIsOpen(false)
  }

  const downloadPageTsx = () => {
    runWithParams((context) => {
      if (typeof document === "undefined") {
        console.error("Document is not available to trigger downloads")
        return
      }
      const content =
        overrides?.generatePageTsxContent?.(context) ??
        defaultPageTsxContent(context)
      const blob = new Blob([content], { type: "text/plain" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${context.solverName}.page.tsx`
      a.click()
      URL.revokeObjectURL(url)
    })
    setIsOpen(false)
  }

  const downloadTestTs = () => {
    runWithParams((context) => {
      if (typeof document === "undefined") {
        console.error("Document is not available to trigger downloads")
        return
      }
      const content =
        overrides?.generateTestTsContent?.(context) ??
        defaultTestTsContent(context)
      const blob = new Blob([content], { type: "text/plain" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${context.solverName}.test.ts`
      a.click()
      URL.revokeObjectURL(url)
    })
    setIsOpen(false)
  }

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        className="px-2 py-1 rounded text-xs cursor-pointer"
        onClick={() => setIsOpen(!isOpen)}
        title={`Download options for ${solver.constructor.name}`}
        type="button"
      >
        {solver.constructor.name}
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-300 rounded shadow-lg z-10 min-w-[150px]">
          <button
            className="w-full text-left px-3 py-2 hover:bg-gray-100 text-xs"
            onClick={downloadJSON}
            type="button"
          >
            Download JSON
          </button>
          <button
            className="w-full text-left px-3 py-2 hover:bg-gray-100 text-xs"
            onClick={downloadPageTsx}
            type="button"
          >
            Download page.tsx
          </button>
          <button
            className="w-full text-left px-3 py-2 hover:bg-gray-100 text-xs"
            onClick={downloadTestTs}
            type="button"
          >
            Download test.ts
          </button>
        </div>
      )}
    </div>
  )
}
