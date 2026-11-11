import { useEffect, useRef, useState } from "react"
import type { BaseSolver } from "../BaseSolver"

interface DownloadDropdownProps {
  solver: BaseSolver
  className?: string
}

const deepRemoveUnderscoreProperties = (obj: any): any => {
  if (obj === null || typeof obj !== "object") {
    return obj
  }

  if (Array.isArray(obj)) {
    return obj.map(deepRemoveUnderscoreProperties)
  }

  const result: any = {}
  for (const [key, value] of Object.entries(obj)) {
    if (!key.startsWith("_")) {
      result[key] = deepRemoveUnderscoreProperties(value)
    }
  }
  return result
}

export const createPageTsxContent = (solver: BaseSolver): string => {
  const params = deepRemoveUnderscoreProperties(solver.getConstructorParams())
  const solverName = solver.getSolverName()
  const isSchematicTracePipelineSolver =
    solverName === "SchematicTracePipelineSolver"

  if (isSchematicTracePipelineSolver) {
    return `import { PipelineDebugger } from "site/components/PipelineDebugger"
import type { InputProblem } from "lib/types/InputProblem"

const inputProblem: InputProblem = ${JSON.stringify(params, null, 2)}

export default () => <PipelineDebugger inputProblem={inputProblem} />
`
  }

  const isTupleParams = Array.isArray(params)
  const serializedParams = JSON.stringify(params, null, 2)
  const inputDeclaration = isTupleParams
    ? `export const inputProblem: ConstructorParameters<typeof ${solverName}> = ${serializedParams} as any`
    : `export const inputProblem = ${serializedParams}`
  const solverInvocation = isTupleParams
    ? `new ${solverName}(...inputProblem)`
    : `new ${solverName}(inputProblem as any)`

  return `import { useMemo } from "react"
import { GenericSolverDebugger } from "../components/GenericSolverDebugger"
import { ${solverName} } from "lib/solvers/${solverName}/${solverName}"

${inputDeclaration}

export default () => {
  const solver = useMemo(() => {
    return ${solverInvocation}
  }, [])
  return <GenericSolverDebugger solver={solver} />
}
`
}

export const createTestTsContent = (solver: BaseSolver): string => {
  const params = deepRemoveUnderscoreProperties(solver.getConstructorParams())
  const solverName = solver.getSolverName()
  const isTupleParams = Array.isArray(params)
  const serializedParams = JSON.stringify(params, null, 2)
  const inputDeclaration = isTupleParams
    ? `const input: ConstructorParameters<typeof ${solverName}> = ${serializedParams} as any`
    : `const input = ${serializedParams}`
  const solverInvocation = isTupleParams
    ? `new ${solverName}(...input)`
    : `new ${solverName}(input as any)`

  return `import { ${solverName} } from "lib/solvers/${solverName}/${solverName}"
import { test, expect } from "bun:test"

test("${solverName} should solve problem correctly", () => {
  ${inputDeclaration}
  
  const solver = ${solverInvocation}
  solver.solve()

  expect(solver).toMatchSolverSnapshot(import.meta.path)
  
  // Add more specific assertions based on expected output
  // expect(solver.netLabelPlacementSolver!.netLabelPlacements).toMatchInlineSnapshot()
})
`
}

export const DownloadDropdown = ({
  solver,
  className = "",
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

  const downloadJSON = () => {
    try {
      if (typeof solver.getConstructorParams !== "function") {
        alert(
          `getConstructorParams() is not implemented for ${solver.getSolverName()}`,
        )
        return
      }

      const params = deepRemoveUnderscoreProperties(
        solver.getConstructorParams(),
      )
      const blob = new Blob([JSON.stringify(params, null, 2)], {
        type: "application/json",
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${solver.getSolverName()}_params.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      alert(
        `Error downloading params for ${solver.getSolverName()}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
    setIsOpen(false)
  }

  const downloadPageTsx = () => {
    try {
      const content = createPageTsxContent(solver)
      const solverName = solver.getSolverName()
      const blob = new Blob([content], { type: "text/plain" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${solverName}.page.tsx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      alert(
        `Error generating page.tsx for ${solver.getSolverName()}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
    setIsOpen(false)
  }

  const downloadTestTs = () => {
    try {
      const content = createTestTsContent(solver)
      const solverName = solver.getSolverName()
      const blob = new Blob([content], { type: "text/plain" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${solverName}.test.ts`
      a.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      alert(
        `Error generating test.ts for ${solver.getSolverName()}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
    setIsOpen(false)
  }

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        className="px-2 py-1 rounded text-xs cursor-pointer"
        onClick={() => setIsOpen(!isOpen)}
        title={`Download options for ${solver.getSolverName()}`}
      >
        {solver.getSolverName()}
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-300 rounded shadow-lg z-10 min-w-[150px]">
          <button
            className="w-full text-left px-3 py-2 hover:bg-gray-100 text-xs"
            onClick={downloadJSON}
          >
            Download JSON
          </button>
          <button
            className="w-full text-left px-3 py-2 hover:bg-gray-100 text-xs"
            onClick={downloadPageTsx}
          >
            Download page.tsx
          </button>
          <button
            className="w-full text-left px-3 py-2 hover:bg-gray-100 text-xs"
            onClick={downloadTestTs}
          >
            Download test.ts
          </button>
        </div>
      )}
    </div>
  )
}
