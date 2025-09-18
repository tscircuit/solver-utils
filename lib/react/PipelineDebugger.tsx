import React, { useEffect, useMemo, useReducer } from "react"
import { InteractiveGraphics } from "graphics-debug/react"
import type { BasePipelineSolver } from "../BasePipelineSolver"
import type { BaseSolver } from "../BaseSolver"
import type { DownloadGenerators } from "./DownloadDropdown"
import { PipelineStageTable } from "./PipelineStageTable"
import { GenericSolverToolbar } from "./GenericSolverToolbar"

export interface PipelineDebuggerProps {
  solver: BasePipelineSolver<any>
  animationSpeed?: number
  onSolverStarted?: (solver: BaseSolver) => void
  onSolverCompleted?: (solver: BaseSolver) => void
  downloadGenerators?: DownloadGenerators
}

export const PipelineDebugger = ({
  solver,
  animationSpeed,
  onSolverStarted,
  onSolverCompleted,
  downloadGenerators,
}: PipelineDebuggerProps) => {
  const [renderCount, incRenderCount] = useReducer((x: number) => x + 1, 0)

  const visualization = useMemo(() => {
    try {
      return (
        solver.visualize() || { points: [], lines: [], rects: [], circles: [] }
      )
    } catch (error) {
      console.error("Visualization error:", error)
      return { points: [], lines: [], rects: [], circles: [] }
    }
  }, [solver, renderCount])

  const graphicsAreEmpty = useMemo(
    () =>
      (visualization.rects?.length || 0) === 0 &&
      (visualization.lines?.length || 0) === 0 &&
      (visualization.points?.length || 0) === 0 &&
      (visualization.circles?.length || 0) === 0,
    [visualization],
  )

  useEffect(() => {
    if (typeof document === "undefined") return
    if (
      !document.querySelector(
        'script[src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"]',
      )
    ) {
      const script = document.createElement("script")
      script.src = "https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"
      document.head.appendChild(script)
    }
  }, [])

  return (
    <div>
      <GenericSolverToolbar
        solver={solver}
        triggerRender={incRenderCount}
        animationSpeed={animationSpeed}
        onSolverStarted={onSolverStarted}
        onSolverCompleted={onSolverCompleted}
        downloadGenerators={downloadGenerators}
      />
      {graphicsAreEmpty ? (
        <div className="p-4 text-gray-500">No Graphics Yet</div>
      ) : (
        <InteractiveGraphics graphics={visualization} />
      )}
      <PipelineStageTable
        pipelineSolver={solver}
        triggerRender={incRenderCount}
      />
    </div>
  )
}
