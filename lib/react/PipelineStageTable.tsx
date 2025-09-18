import React from "react"
import type { BasePipelineSolver } from "../BasePipelineSolver"
import { deepRemoveUnderscoreProperties } from "./DownloadDropdown"

type StageStatus = "Solved" | "Failed" | "Running" | "Not Started"

const getStageStatus = (
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

const triggerJsonDownload = (fileName: string, data: any) => {
  if (typeof window === "undefined") return
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  })
  const url = window.URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  window.URL.revokeObjectURL(url)
}

export interface PipelineStageTableProps {
  pipelineSolver: BasePipelineSolver<any>
  triggerRender: () => void
}

export const PipelineStageTable = ({
  pipelineSolver,
  triggerRender,
}: PipelineStageTableProps) => {
  const handleDownloadParams = (stageName: string) => {
    const stageDef = pipelineSolver.pipelineDef.find(
      (stage) => stage.solverName === stageName,
    )
    if (!stageDef) return

    try {
      const params = deepRemoveUnderscoreProperties(
        stageDef.getConstructorParams(pipelineSolver),
      )
      triggerJsonDownload(`${stageName}_params.json`, params)
    } catch (error) {
      window.alert(
        `Error downloading params for ${stageName}: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  return (
    <div className="overflow-x-auto mt-4">
      <table className="min-w-full border border-gray-300 text-sm">
        <thead>
          <tr className="bg-gray-100">
            <th className="border border-gray-300 px-4 py-2 text-left">Stage</th>
            <th className="border border-gray-300 px-4 py-2 text-left">
              Status
            </th>
            <th className="border border-gray-300 px-4 py-2 text-left">
              Start Iteration
            </th>
            <th className="border border-gray-300 px-4 py-2 text-left">
              End Iteration
            </th>
            <th className="border border-gray-300 px-4 py-2 text-left">
              Time (ms)
            </th>
            <th className="border border-gray-300 px-4 py-2 text-left">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {pipelineSolver.pipelineDef.map((stage, index) => {
            const status = getStageStatus(pipelineSolver, index)
            const startIteration =
              pipelineSolver.firstIterationOfPhase[stage.solverName]
            const endIteration = (() => {
              if (status !== "Solved") return undefined
              const phaseStart =
                pipelineSolver.firstIterationOfPhase[stage.solverName] || 0
              const phaseSolver = (pipelineSolver as any)[stage.solverName]
              const iterations = phaseSolver?.iterations || 0
              return phaseStart + iterations
            })()
            const timeSpent = pipelineSolver.timeSpentOnPhase[stage.solverName]

            return (
              <tr key={stage.solverName} className="hover:bg-gray-50">
                <td className="border border-gray-300 px-4 py-2 font-mono">
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
                      type="button"
                      title={`Run until ${stage.solverName} is active`}
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
                    onClick={() => handleDownloadParams(stage.solverName)}
                    className="bg-blue-500 hover:bg-blue-600 text-white px-2 py-1 rounded text-xs"
                    type="button"
                    title="Download constructor params"
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
