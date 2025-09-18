import React from "react"
import type { BaseSolver } from "../BaseSolver"
import { DownloadDropdown } from "./DownloadDropdown"

export const getSolverChain = (solver: BaseSolver): BaseSolver[] => {
  const chain: BaseSolver[] = []
  const visited = new Set<BaseSolver>()
  let current: BaseSolver | null | undefined = solver

  while (current && !visited.has(current)) {
    chain.push(current)
    visited.add(current)
    current = current.activeSubSolver ?? undefined
  }

  return chain
}

export interface SolverBreadcrumbInputDownloaderProps {
  solver: BaseSolver
  className?: string
}

export const SolverBreadcrumbInputDownloader = ({
  solver,
  className = "",
}: SolverBreadcrumbInputDownloaderProps) => {
  const solverChain = getSolverChain(solver)

  return (
    <div className={`flex flex-wrap gap-2 items-center text-xs text-gray-600 ${className}`}>
      {solverChain.map((chainSolver, index) => (
        <div key={`${chainSolver.constructor.name}-${index}`} className="flex items-center gap-1">
          {index > 0 ? <span className="text-gray-400">→</span> : null}
          <DownloadDropdown solver={chainSolver} />
        </div>
      ))}
    </div>
  )
}
