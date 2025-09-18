import React from "react"
import type { BaseSolver } from "../BaseSolver"
import { DownloadDropdown, type DownloadTemplateOverrides } from "./DownloadDropdown"

export const getSolverChain = (solver: BaseSolver): BaseSolver[] => {
  if (!solver.activeSubSolver) {
    return [solver]
  }
  return [solver, ...getSolverChain(solver.activeSubSolver)]
}

export interface SolverBreadcrumbInputDownloaderProps {
  solver: BaseSolver
  className?: string
  overrides?: DownloadTemplateOverrides
}

/**
 * Displays each solver in the chain as a breadcrumb with download functionality
 */
export const SolverBreadcrumbInputDownloader: React.FC<
  SolverBreadcrumbInputDownloaderProps
> = ({ solver, className = "", overrides }) => {
  const solverChain = getSolverChain(solver)

  return (
    <div className={`flex gap-1 items-center text-sm pt-1 ${className}`}>
      {solverChain.map((s, index) => (
        <div key={`${s.constructor.name}-${index}`} className="flex items-center">
          {index > 0 && <span className="text-gray-400 mx-1">→</span>}
          <DownloadDropdown solver={s} overrides={overrides} />
        </div>
      ))}
    </div>
  )
}
