import React from "react"
import type { BaseSolver } from "../BaseSolver"
import { DownloadDropdown } from "./DownloadDropdown"

export const getSolverChain = (solver: BaseSolver): BaseSolver[] => {
  if (!solver.activeSubSolver) {
    return [solver]
  }
  return [solver, ...getSolverChain(solver.activeSubSolver)]
}

/**
 * Displays each solver in the chain as a breadcrumb with download functionality
 */
export const SolverBreadcrumbInputDownloader = ({
  solver,
}: {
  solver: BaseSolver
}) => {
  const solverChain = getSolverChain(solver)

  return (
    <div className="flex gap-1 items-center text-sm">
      {solverChain.map((s, index) => (
        <div
          key={`${s.constructor.name}-${index}`}
          className="flex items-center"
        >
          <DownloadDropdown solver={s} />
        </div>
      ))}
    </div>
  )
}
