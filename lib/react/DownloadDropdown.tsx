import React, { useEffect, useRef, useState } from "react"
import type { BaseSolver } from "../BaseSolver"
import {
  getConstructorParamsSafely,
  stringifyForDownload,
  triggerDownload,
} from "./solverDownloadUtils"
import {
  resolvePageDownloadConfig,
  resolveTestDownloadConfig,
} from "./solverDownloadOverrides"

export interface DownloadDropdownProps {
  solver: BaseSolver
  className?: string
}

interface ConstructorParamMetadata {
  variableName: string
  serializedValue: string
  isArray: boolean
}

const getConstructorParamMetadata = (
  constructorParams: unknown,
): ConstructorParamMetadata => {
  const isArray = Array.isArray(constructorParams)
  return {
    variableName: isArray ? "constructorArgs" : "inputProblem",
    serializedValue: stringifyForDownload(constructorParams),
    isArray,
  }
}

const buildInstantiationSnippet = (
  solverName: string,
  metadata: ConstructorParamMetadata,
) => {
  if (metadata.isArray) {
    return `new ${solverName}(...${metadata.variableName} as any[])`
  }
  return `new ${solverName}(${metadata.variableName} as any)`
}

const buildDefaultPageContent = (
  solver: BaseSolver,
  constructorParams: unknown,
) => {
  const solverName = solver.constructor.name
  const isPipelineSolver =
    solverName === "SchematicTracePipelineSolver" ||
    typeof (solver as any).pipelineDef !== "undefined"

  const paramMetadata = getConstructorParamMetadata(constructorParams)
  const declaration = `const ${paramMetadata.variableName} = ${paramMetadata.serializedValue}`
  const instantiation = buildInstantiationSnippet(solverName, paramMetadata)

  if (isPipelineSolver) {
    return `import { useMemo } from "react"
import { PipelineDebugger } from "@tscircuit/solver-utils/lib/react"
import { ${solverName} } from "lib/solvers/${solverName}/${solverName}"

export ${declaration}

export default () => {
  const solver = useMemo(() => {
    return ${instantiation}
  }, [])
  return <PipelineDebugger solver={solver} />
}
`
  }

  return `import { useMemo } from "react"
import { GenericSolverDebugger } from "@tscircuit/solver-utils/lib/react"
import { ${solverName} } from "lib/solvers/${solverName}/${solverName}"

export ${declaration}

export default () => {
  const solver = useMemo(() => {
    return ${instantiation}
  }, [])
  return <GenericSolverDebugger solver={solver} />
}
`
}

const buildDefaultTestContent = (
  solver: BaseSolver,
  constructorParams: unknown,
) => {
  const solverName = solver.constructor.name
  const paramMetadata = getConstructorParamMetadata(constructorParams)
  const declaration = `const ${paramMetadata.variableName} = ${paramMetadata.serializedValue}`
  const instantiation = buildInstantiationSnippet(solverName, paramMetadata)
  return `import { ${solverName} } from "lib/solvers/${solverName}/${solverName}"
import { expect, test } from "bun:test"

test("${solverName} should solve problem correctly", () => {
  ${declaration}

  const solver = ${instantiation}
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
    if (typeof document === "undefined") {
      return
    }

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

  const closeDropdown = () => setIsOpen(false)

  const downloadJSON = () => {
    const params = getConstructorParamsSafely(solver)
    if (!params) {
      closeDropdown()
      return
    }

    triggerDownload(
      `${solver.constructor.name}_params.json`,
      stringifyForDownload(params.sanitized),
      "application/json",
    )
    closeDropdown()
  }

  const downloadPageTsx = () => {
    const params = getConstructorParamsSafely(solver)
    if (!params) {
      closeDropdown()
      return
    }

    const defaultContent = buildDefaultPageContent(solver, params.sanitized)
    const { filename, contents } = resolvePageDownloadConfig({
      solver,
      constructorParams: params.sanitized,
      rawConstructorParams: params.raw,
      defaultFilename: `${solver.constructor.name}.page.tsx`,
      defaultContents: defaultContent,
    })

    triggerDownload(filename, contents)
    closeDropdown()
  }

  const downloadTestTs = () => {
    const params = getConstructorParamsSafely(solver)
    if (!params) {
      closeDropdown()
      return
    }

    const defaultContent = buildDefaultTestContent(
      solver,
      params.sanitized,
    )
    const { filename, contents } = resolveTestDownloadConfig({
      solver,
      constructorParams: params.sanitized,
      rawConstructorParams: params.raw,
      defaultFilename: `${solver.constructor.name}.test.ts`,
      defaultContents: defaultContent,
    })

    triggerDownload(filename, contents)
    closeDropdown()
  }

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        className="px-2 py-1 rounded text-xs cursor-pointer border border-gray-200 hover:bg-gray-50 bg-white"
        onClick={() => setIsOpen((prev) => !prev)}
        title={`Download options for ${solver.constructor.name}`}
        type="button"
      >
        {solver.constructor.name}
      </button>

      {isOpen ? (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded shadow-lg z-10 min-w-[170px]">
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
      ) : null}
    </div>
  )
}
