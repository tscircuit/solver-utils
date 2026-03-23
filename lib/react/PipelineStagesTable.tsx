import React, { useState } from "react"
import type { BasePipelineSolver } from "../BasePipelineSolver"
import type { BaseSolver } from "../BaseSolver"

interface PipelineStagesTableProps {
  solver: BasePipelineSolver<any>
  onStepUntilPhase?: (phaseName: string) => void
  onDownloadInput?: (solver: BaseSolver, stepName: string) => void
  /** Used for nested tables - removes title and adds indentation */
  isNested?: boolean
  /** Indentation level for nested tables */
  indentLevel?: number
  /** Callback to trigger re-render after solver state changes */
  triggerRender?: () => void
}

/** Check if a solver is a pipeline solver (has pipelineDef) */
const isPipelineSolver = (
  solver: BaseSolver | null,
): solver is BasePipelineSolver<any> => {
  return (
    solver !== null &&
    "pipelineDef" in solver &&
    Array.isArray((solver as any).pipelineDef)
  )
}

type StageStatus = "Not Started" | "In Progress" | "Completed" | "Failed"

interface StageInfo {
  index: number
  name: string
  status: StageStatus
  firstIteration: number | null
  iterations: number
  progress: number
  timeSpent: number
  stats: Record<string, any> | null
  solverInstance: BaseSolver | null
}

interface SolverTreeNode {
  id: string
  name: string
  status: StageStatus
  children: SolverTreeNode[]
}

const getSolverTreeStatus = (solver: BaseSolver): StageStatus => {
  if (solver.failed) return "Failed"
  if (solver.solved) return "Completed"
  if (solver.iterations > 0 || solver.activeSubSolver) return "In Progress"
  return "Not Started"
}

export const getActiveSubSolverTree = (
  solver: BaseSolver,
  path = solver.getSolverName(),
): SolverTreeNode[] => {
  if (!solver.activeSubSolver) {
    return []
  }

  const childSolver = solver.activeSubSolver
  const childPath = `${path}.${childSolver.getSolverName()}`

  return [
    {
      id: childPath,
      name: childSolver.getSolverName(),
      status: getSolverTreeStatus(childSolver),
      children: getActiveSubSolverTree(childSolver, childPath),
    },
  ]
}

const getStageStatus = (
  solver: BasePipelineSolver<any>,
  stepIndex: number,
  stepName: string,
): StageStatus => {
  const currentIndex = solver.currentPipelineStageIndex

  if (stepIndex < currentIndex) {
    return "Completed"
  }

  if (stepIndex === currentIndex) {
    if (solver.activeSubSolver) {
      if (solver.activeSubSolver.failed) {
        return "Failed"
      }
      return "In Progress"
    }
    return "Not Started"
  }

  return "Not Started"
}

const getStageInfo = (
  solver: BasePipelineSolver<any>,
  stageIndex: number,
): StageInfo => {
  const stage = solver.pipelineDef[stageIndex]!
  const stageName = stage.solverName
  const status = getStageStatus(solver, stageIndex, stageName)
  const solverInstance = (solver as any)[stageName] as
    | Partial<BaseSolver>
    | undefined

  const firstIteration =
    solver.firstIterationOfStage?.[stageName] ??
    (stageIndex === solver.currentPipelineStageIndex ? solver.iterations : null)
  const currentIteration = solver.iterations

  let iterations = 0
  if (status === "Completed") {
    const nextStage = solver.pipelineDef[stageIndex + 1]
    const nextStageFirstIteration = nextStage
      ? solver.firstIterationOfStage?.[nextStage.solverName]
      : undefined
    if (nextStageFirstIteration !== undefined && firstIteration !== null) {
      iterations = nextStageFirstIteration - firstIteration
    } else if (firstIteration !== null) {
      iterations = currentIteration - firstIteration
    }
  } else if (status === "In Progress" && firstIteration !== null) {
    iterations = currentIteration - firstIteration
  }

  const timeSpent = solver.timeSpentOnStage?.[stageName] ?? 0

  let progress = 0
  if (status === "Completed") {
    progress = 1
  } else if (status === "In Progress" && solverInstance) {
    progress = solverInstance.progress ?? 0
  }

  const stats = solverInstance?.stats ?? null

  return {
    index: stageIndex,
    name: stageName,
    status,
    firstIteration,
    iterations,
    progress,
    timeSpent,
    stats: stats && Object.keys(stats).length > 0 ? stats : null,
    solverInstance: (solverInstance as any) ?? null,
  }
}

const StatusBadge = ({ status }: { status: StageStatus }) => {
  const colors: Record<StageStatus, string> = {
    "Not Started": "text-blue-600",
    "In Progress": "text-yellow-600",
    Completed: "text-green-600",
    Failed: "text-red-600",
  }

  return <span className={`font-medium ${colors[status]}`}>{status}</span>
}

const ProgressBar = ({ progress }: { progress: number }) => {
  if (progress === 0) return null

  const percentage = Math.round(progress * 100)

  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-2 bg-gray-200 rounded overflow-hidden">
        <div
          className="h-full bg-blue-500 transition-all duration-200"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-xs text-gray-500">{percentage}%</span>
    </div>
  )
}

const stringifyStatValue = (value: unknown): string => {
  if (typeof value === "string") {
    return value
  }
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint" ||
    value == null
  ) {
    return String(value)
  }

  if (typeof value === "object") {
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }

  return String(value)
}

const formatStatsLine = (stats: Record<string, any>): string => {
  return Object.entries(stats)
    .map(([key, value]) => `${key}: ${stringifyStatValue(value)}`)
    .join(", ")
}

const StatsCell = ({ stats }: { stats: Record<string, any> | null }) => {
  if (!stats || Object.keys(stats).length === 0) {
    return <span>-</span>
  }

  const entries = Object.entries(stats)
  const summaryText = formatStatsLine(stats)

  return (
    <details className="cursor-pointer">
      <summary className="whitespace-nowrap overflow-hidden text-ellipsis max-w-[200px]">
        {summaryText}
      </summary>
      <div className="mt-1 text-xs">
        {entries.map(([key, value]) => (
          <div key={key}>
            {key}: {stringifyStatValue(value)}
          </div>
        ))}
      </div>
    </details>
  )
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

const downloadSolverInput = (solver: BaseSolver, stageName: string) => {
  try {
    if (typeof solver.getConstructorParams !== "function") {
      alert(`getConstructorParams() is not implemented for ${stageName}`)
      return
    }

    const params = deepRemoveUnderscoreProperties(solver.getConstructorParams())
    const blob = new Blob([JSON.stringify(params, null, 2)], {
      type: "application/json",
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${stageName}_input.json`
    a.click()
    URL.revokeObjectURL(url)
  } catch (error) {
    alert(
      `Error downloading input for ${stageName}: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

/** Chevron icon for expand/collapse */
const ChevronIcon = ({ expanded }: { expanded: boolean }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    className={`w-4 h-4 transition-transform duration-200 ${expanded ? "rotate-90" : ""}`}
  >
    <path
      fillRule="evenodd"
      d="M8.47 4.97a.75.75 0 011.06 0l6.5 6.5a.75.75 0 010 1.06l-6.5 6.5a.75.75 0 11-1.06-1.06L14.44 12 8.47 6.03a.75.75 0 010-1.06z"
      clipRule="evenodd"
    />
  </svg>
)

const SkipIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    className="w-4 h-4"
  >
    <path d="M5.25 5.25a.75.75 0 011.17-.62l8.5 6a.75.75 0 010 1.22l-8.5 6a.75.75 0 01-1.17-.62v-12z" />
    <path d="M17.25 5.25a.75.75 0 011.5 0v13.5a.75.75 0 01-1.5 0V5.25z" />
  </svg>
)

const SolverTree = ({
  nodes,
  depth = 0,
}: {
  nodes: SolverTreeNode[]
  depth?: number
}) => {
  if (nodes.length === 0) {
    return null
  }

  return (
    <div className="mt-1 space-y-1">
      {nodes.map((node) => (
        <div key={node.id}>
          <div
            className="flex items-center gap-2 text-xs text-gray-500"
            style={{ paddingLeft: depth * 16 }}
          >
            <span className="text-gray-300">↳</span>
            <span>{node.name}</span>
            <StatusBadge status={node.status} />
          </div>
          <SolverTree nodes={node.children} depth={depth + 1} />
        </div>
      ))}
    </div>
  )
}

/** Find the deepest activeSubSolver by traversing the chain */
const getDeepestActiveSubSolver = (solver: BaseSolver): BaseSolver => {
  let current = solver
  while (current.activeSubSolver) {
    current = current.activeSubSolver
  }
  return current
}

export const PipelineStagesTable = ({
  solver,
  onStepUntilPhase,
  onDownloadInput,
  isNested = false,
  indentLevel = 0,
  triggerRender,
}: PipelineStagesTableProps) => {
  const [expandedStages, setExpandedStages] = useState<Set<string>>(new Set())

  const stages = solver.pipelineDef.map((_, index) =>
    getStageInfo(solver, index),
  )

  const toggleExpanded = (stageName: string) => {
    setExpandedStages((prev) => {
      const next = new Set(prev)
      if (next.has(stageName)) {
        next.delete(stageName)
      } else {
        next.add(stageName)
      }
      return next
    })
  }

  const handlePlayClick = (stageName: string) => {
    onStepUntilPhase?.(stageName)
  }

  const handleDownloadInput = (stageInfo: StageInfo) => {
    if (stageInfo.solverInstance) {
      if (onDownloadInput) {
        onDownloadInput(stageInfo.solverInstance, stageInfo.name)
      } else {
        downloadSolverInput(stageInfo.solverInstance, stageInfo.name)
      }
    }
  }

  const formatTime = (ms: number): string => {
    return `${(ms / 1000).toFixed(2)}s`
  }

  const handleNextStage = () => {
    if (!solver.solved && !solver.failed) {
      const initialActiveSubSolver = solver.activeSubSolver

      // Step until the activeSubSolver is defined and different from the last one
      while (!solver.solved && !solver.failed) {
        solver.step()
        if (
          solver.activeSubSolver &&
          solver.activeSubSolver !== initialActiveSubSolver
        ) {
          break
        }
      }
      triggerRender?.()
    }
  }

  const handleNextSolver = () => {
    if (!solver.solved && !solver.failed) {
      const initialDeepestSolver = getDeepestActiveSubSolver(solver)

      // Step until the deepest activeSubSolver changes
      while (!solver.solved && !solver.failed) {
        solver.step()
        const currentDeepestSolver = getDeepestActiveSubSolver(solver)
        if (currentDeepestSolver !== initialDeepestSolver) {
          break
        }
      }
      triggerRender?.()
    }
  }

  const indentPadding = indentLevel * 24

  return (
    <div className={isNested ? "" : "border-t border-gray-200"}>
      {!isNested && (
        <div className="px-4 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">
            Pipeline Stages
          </h3>
          <div className="flex gap-2">
            <button
              onClick={handleNextSolver}
              disabled={solver.solved || solver.failed}
              className="bg-indigo-500 hover:bg-indigo-600 disabled:bg-gray-300 disabled:cursor-not-allowed cursor-pointer text-white px-3 py-1 rounded text-sm"
            >
              Next Solver
            </button>
            <button
              onClick={handleNextStage}
              disabled={solver.solved || solver.failed}
              className="bg-purple-500 hover:bg-purple-600 disabled:bg-gray-300 disabled:cursor-not-allowed cursor-pointer text-white px-3 py-1 rounded text-sm"
            >
              Next Stage
            </button>
          </div>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          {!isNested && (
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-2 text-left font-semibold text-gray-700">
                  Stage
                </th>
                <th className="px-4 py-2 text-left font-semibold text-gray-700">
                  Status
                </th>
                <th className="px-4 py-2 text-center font-semibold text-gray-700">
                  i<sub>0</sub>
                </th>
                <th className="px-4 py-2 text-left font-semibold text-gray-700">
                  Iterations
                </th>
                <th className="px-4 py-2 text-left font-semibold text-gray-700">
                  Progress
                </th>
                <th className="px-4 py-2 text-left font-semibold text-gray-700">
                  Time
                </th>
                <th className="px-4 py-2 text-left font-semibold text-gray-700">
                  Stats
                </th>
                <th className="px-4 py-2 text-left font-semibold text-gray-700">
                  Input
                </th>
              </tr>
            </thead>
          )}
          <tbody>
            {stages.map((stage) => {
              const isPipeline = isPipelineSolver(stage.solverInstance)
              const isExpanded = expandedStages.has(stage.name)
              const activeSubSolverTree = stage.solverInstance
                ? getActiveSubSolverTree(stage.solverInstance, stage.name)
                : []

              return (
                <React.Fragment key={stage.name}>
                  <tr
                    className={`border-b border-gray-100 ${
                      stage.status === "In Progress" ? "bg-yellow-50" : ""
                    }`}
                  >
                    <td className="px-4 py-2 align-top">
                      <div
                        className="flex items-start gap-2"
                        style={{ paddingLeft: indentPadding }}
                      >
                        {isPipeline ? (
                          <button
                            onClick={() => toggleExpanded(stage.name)}
                            className="text-gray-500 hover:text-gray-700 mt-0.5"
                            title={isExpanded ? "Collapse" : "Expand"}
                          >
                            <ChevronIcon expanded={isExpanded} />
                          </button>
                        ) : (
                          <span className="w-4 shrink-0" />
                        )}
                        <span className="text-gray-400 w-6 shrink-0 mt-0.5">
                          {String(stage.index + 1).padStart(2, "0")}
                        </span>
                        <button
                          onClick={() => handlePlayClick(stage.name)}
                          disabled={
                            stage.status === "Completed" ||
                            solver.solved ||
                            solver.failed
                          }
                          className="text-blue-500 hover:text-blue-700 disabled:text-gray-300 disabled:cursor-not-allowed mt-0.5"
                          title={`Step until ${stage.name} completes`}
                        >
                          <SkipIcon />
                        </button>
                        <div className="min-w-0">
                          <span className="font-medium text-gray-900">
                            {stage.name}
                          </span>
                          <SolverTree nodes={activeSubSolverTree} />
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2">
                      <StatusBadge status={stage.status} />
                    </td>
                    <td className="px-4 py-2 text-center text-gray-600">
                      {stage.firstIteration !== null
                        ? stage.firstIteration
                        : ""}
                    </td>
                    <td className="px-4 py-2 text-gray-600">
                      {stage.iterations}
                    </td>
                    <td className="px-4 py-2">
                      <ProgressBar progress={stage.progress} />
                    </td>
                    <td className="px-4 py-2 text-gray-600">
                      {formatTime(stage.timeSpent)}
                    </td>
                    <td className="px-4 py-2 text-gray-500">
                      <StatsCell stats={stage.stats} />
                    </td>
                    <td className="px-4 py-2">
                      {stage.solverInstance ? (
                        <button
                          onClick={() => handleDownloadInput(stage)}
                          className="flex items-center gap-1 text-blue-500 hover:text-blue-700"
                          title={`Download input for ${stage.name}`}
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                            className="w-4 h-4"
                          >
                            <path
                              fillRule="evenodd"
                              d="M12 2.25a.75.75 0 01.75.75v11.69l3.22-3.22a.75.75 0 111.06 1.06l-4.5 4.5a.75.75 0 01-1.06 0l-4.5-4.5a.75.75 0 111.06-1.06l3.22 3.22V3a.75.75 0 01.75-.75zm-9 13.5a.75.75 0 01.75.75v2.25a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5V16.5a.75.75 0 011.5 0v2.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V16.5a.75.75 0 01.75-.75z"
                              clipRule="evenodd"
                            />
                          </svg>
                          <span>Input</span>
                        </button>
                      ) : null}
                    </td>
                  </tr>
                  {isPipeline && isExpanded && (
                    <tr>
                      <td colSpan={8} className="p-0">
                        <PipelineStagesTable
                          solver={
                            stage.solverInstance as BasePipelineSolver<any>
                          }
                          onStepUntilPhase={onStepUntilPhase}
                          onDownloadInput={onDownloadInput}
                          isNested={true}
                          indentLevel={indentLevel + 1}
                          triggerRender={triggerRender}
                        />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
