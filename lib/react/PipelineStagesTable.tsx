import React from "react"
import type { BasePipelineSolver } from "../BasePipelineSolver"
import type { BaseSolver } from "../BaseSolver"

interface PipelineStagesTableProps {
  solver: BasePipelineSolver<any>
  onStepUntilPhase?: (phaseName: string) => void
  onDownloadInput?: (solver: BaseSolver, stepName: string) => void
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

const getStageStatus = (
  solver: BasePipelineSolver<any>,
  stepIndex: number,
  stepName: string,
): StageStatus => {
  const currentIndex = solver.currentPipelineStepIndex

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
  stepIndex: number,
): StageInfo => {
  const step = solver.pipelineDef[stepIndex]!
  const stepName = step.solverName
  const status = getStageStatus(solver, stepIndex, stepName)
  const solverInstance = (solver as any)[stepName] as BaseSolver | undefined

  const firstIteration = solver.firstIterationOfPhase?.[stepName] ?? null
  const currentIteration = solver.iterations

  let iterations = 0
  if (status === "Completed") {
    const nextStep = solver.pipelineDef[stepIndex + 1]
    const nextStepFirstIteration = nextStep
      ? solver.firstIterationOfPhase[nextStep.solverName]
      : undefined
    if (nextStepFirstIteration !== undefined && firstIteration !== null) {
      iterations = nextStepFirstIteration - firstIteration
    } else if (firstIteration !== null) {
      iterations = currentIteration - firstIteration
    }
  } else if (status === "In Progress" && firstIteration !== null) {
    iterations = currentIteration - firstIteration
  }

  const timeSpent = solver.timeSpentOnPhase?.[stepName] ?? 0

  let progress = 0
  if (status === "Completed") {
    progress = 1
  } else if (status === "In Progress" && solverInstance) {
    progress = solverInstance.progress ?? 0
  }

  const stats = solverInstance?.stats ?? null

  return {
    index: stepIndex,
    name: stepName,
    status,
    firstIteration,
    iterations,
    progress,
    timeSpent,
    stats: stats && Object.keys(stats).length > 0 ? stats : null,
    solverInstance: solverInstance ?? null,
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

const formatStatsLine = (stats: Record<string, any>): string => {
  return Object.entries(stats)
    .map(([key, value]) => `${key}: ${value}`)
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
            {key}: {String(value)}
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

export const PipelineStagesTable = ({
  solver,
  onStepUntilPhase,
  onDownloadInput,
}: PipelineStagesTableProps) => {
  const stages = solver.pipelineDef.map((_, index) =>
    getStageInfo(solver, index),
  )

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

  return (
    <div className="border-t border-gray-200">
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-700">Pipeline Steps</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-4 py-2 text-left font-semibold text-gray-700">
                Step
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
          <tbody>
            {stages.map((stage) => (
              <tr
                key={stage.name}
                className={`border-b border-gray-100 ${
                  stage.status === "In Progress" ? "bg-yellow-50" : ""
                }`}
              >
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400 w-6">
                      {String(stage.index + 1).padStart(2, "0")}
                    </span>
                    <button
                      onClick={() => handlePlayClick(stage.name)}
                      disabled={
                        stage.status === "Completed" ||
                        solver.solved ||
                        solver.failed
                      }
                      className="text-blue-500 hover:text-blue-700 disabled:text-gray-300 disabled:cursor-not-allowed"
                      title={`Step until ${stage.name} completes`}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="currentColor"
                        className="w-4 h-4"
                      >
                        <path
                          fillRule="evenodd"
                          d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </button>
                    <span className="font-medium text-gray-900">
                      {stage.name}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-2">
                  <StatusBadge status={stage.status} />
                </td>
                <td className="px-4 py-2 text-center text-gray-600">
                  {stage.firstIteration !== null ? stage.firstIteration : ""}
                </td>
                <td className="px-4 py-2 text-gray-600">{stage.iterations}</td>
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
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
