import React from "react"
import type { BaseSolver } from "../BaseSolver"
import { DownloadDropdown, type DownloadGenerators } from "./DownloadDropdown"

export const getSolverChain = (solver: BaseSolver): BaseSolver[] => {
  if (!solver.activeSubSolver) {
    return [solver]
  }
  return [solver, ...getSolverChain(solver.activeSubSolver)]
}

export interface SolverBreadcrumbInputDownloaderProps {
  solver: BaseSolver
  generators?: DownloadGenerators
}

export const SolverBreadcrumbInputDownloader = ({
  solver,
  generators,
}: SolverBreadcrumbInputDownloaderProps) => {
  const solverChain = getSolverChain(solver)

  return (
    <div className="flex gap-1 items-center text-sm pt-1 flex-wrap">
      {solverChain.map((solverInChain, index) => (
        <div key={solverInChain.constructor.name} className="flex items-center">
          {index > 0 ? <span className="text-gray-400 mx-1">→</span> : null}
          <DownloadDropdown solver={solverInChain} generators={generators} />
        </div>
      ))}
    </div>
  )
}
