import React from "react"
import type { BasePipelineSolver } from "../BasePipelineSolver"
import {
  sanitizeConstructorParams,
  stringifyForDownload,
  triggerDownload,
} from "./solverDownloadUtils"

type StageStatus = "Solved" | "Failed" | "Running" | "Not Started"

export interface PipelineStageTableProps {
  pipelineSolver: BasePipelineSolver<any>
  triggerRender: () => void
}

const determineStageStatus = (
  pipelineSolver: BasePipelineSolver<any>,
  stageIndex: number,
): StageStatus => {
  if (pipelineSolver.currentPipelineStepIndex > stageIndex) {
    return "Solved"
  }
  if (pipelineSolver.currentPipelineStepIndex === stageIndex) {
    if (pipelineSolver.failed) return "Failed"
    if (pipelineSolver.activeSubSolver) return "Running"
  }
  return "Not Started"
}

const downloadStageParams = (
  pipelineSolver: BasePipelineSolver<any>,
  stageName: string,
) => {
  const stage = pipelineSolver.pipelineDef.find(
    (step) => step.solverName === stageName,
  )

  if (!stage) {
    return
  }

  try {
    const params = stage.getConstructorParams(pipelineSolver)
    const sanitized = sanitizeConstructorParams(params)
    triggerDownload(
      `${stageName}_params.json`,
      stringifyForDownload(sanitized),
      "application/json",
    )
  } catch (error) {
    const message =
      error instanceof Error ? error.message : `Unknown error: ${String(error)}`
    const fullMessage = `Error downloading params for ${stageName}: ${message}`
    console.error(fullMessage)
    if (typeof window !== "undefined" && typeof window.alert === "function") {
      window.alert(fullMessage)
    }
  }
}

export const PipelineStageTable = ({
  pipelineSolver,
  triggerRender,
}: PipelineStageTableProps) => {
  return (
    <div className="overflow-x-auto mt-4">
      <table className="min-w-full border border-gray-300 text-sm">
        <thead>
          <tr className="bg-gray-100">
            <th className="border border-gray-300 px-4 py-2 text-left">Stage</th>
            <th className="border border-gray-300 px-4 py-2 text-left">Status</th>
            <th className="border border-gray-300 px-4 py-2 text-left">
              Start Iteration
            </th>
            <th className="border border-gray-300 px-4 py-2 text-left">
              End Iteration
            </th>
            <th className="border border-gray-300 px-4 py-2 text-left">Time (ms)</th>
            <th className="border border-gray-300 px-4 py-2 text-left">Actions</th>
          </tr>
        </thead>
        <tbody>
          {pipelineSolver.pipelineDef.map((stage, index) => {
            const status = determineStageStatus(pipelineSolver, index)
            const startIteration =
              pipelineSolver.firstIterationOfPhase[stage.solverName]
            const endIteration =
              status === "Solved"
                ? (pipelineSolver.firstIterationOfPhase[stage.solverName] || 0) +
                  ((pipelineSolver as any)[stage.solverName]?.iterations || 0)
                : undefined
            const timeSpent = pipelineSolver.timeSpentOnPhase[stage.solverName]

            return (
              <tr key={stage.solverName} className="hover:bg-gray-50">
                <td className="border border-gray-300 px-4 py-2 font-mono text-xs">
                  {stage.solverName}
                </td>
                <td className="border border-gray-300 px-4 py-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-1 rounded text-xs ${
                        status === "Solved"
                          ? "bg-green-100 text-green-800"
                          : status === "Failed"
                            ? "bg-red-100 text-red-800"
                            : status === "Running"
                              ? "bg-yellow-100 text-yellow-800"
                              : "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {status}
                    </span>
                    <button
                      onClick={() => {
                        pipelineSolver.solveUntilPhase(stage.solverName)
                        triggerRender()
                      }}
                      className="hover:bg-green-500 text-gray-600 hover:text-white px-2 py-1 rounded text-xs"
                      title={`Run until ${stage.solverName} is active`}
                      type="button"
                    >
                      ▶️
                    </button>
                  </div>
                </td>
                <td className="border border-gray-300 px-4 py-2 text-center">
                  {startIteration !== undefined ? startIteration : "-"}
                </td>
                <td className="border border-gray-300 px-4 py-2 text-center">
                  {endIteration !== undefined ? endIteration : "-"}
                </td>
                <td className="border border-gray-300 px-4 py-2 text-center">
                  {timeSpent !== undefined ? Math.round(timeSpent) : "-"}
                </td>
                <td className="border border-gray-300 px-4 py-2 text-center">
                  <button
                    onClick={() => downloadStageParams(pipelineSolver, stage.solverName)}
                    className="bg-blue-500 hover:bg-blue-600 text-white px-2 py-1 rounded text-xs"
                    title="Download constructor params"
                    type="button"
                  >
                    ⬇️
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
