import React, { useMemo, useReducer } from "react"
import type { BasePipelineSolver } from "../BasePipelineSolver"
import type { BaseSolver } from "../BaseSolver"
import { InteractiveGraphics } from "graphics-debug/react"
import { GenericSolverToolbar } from "./GenericSolverToolbar"
import { PipelineStageTable } from "./PipelineStageTable"
import type { DownloadTemplateOverrides } from "./DownloadDropdown"

export interface PipelineDebuggerProps {
  solver: BasePipelineSolver<any>
  animationSpeed?: number
  onSolverStarted?: (solver: BaseSolver) => void
  onSolverCompleted?: (solver: BaseSolver) => void
  downloadOverrides?: DownloadTemplateOverrides
}

export const PipelineDebugger: React.FC<PipelineDebuggerProps> = ({
  solver,
  animationSpeed = 25,
  onSolverStarted,
  onSolverCompleted,
  downloadOverrides,
}) => {
  const [renderCount, incRenderCount] = useReducer((x) => x + 1, 0)

  const visualization = useMemo(() => {
    try {
      return (
        solver.visualize() || {
          points: [],
          lines: [],
          rects: [],
          circles: [],
        }
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

  return (
    <div>
      <GenericSolverToolbar
        solver={solver}
        triggerRender={incRenderCount}
        animationSpeed={animationSpeed}
        onSolverStarted={onSolverStarted}
        onSolverCompleted={onSolverCompleted}
        downloadOverrides={downloadOverrides}
      />
      {graphicsAreEmpty ? (
        <div className="p-4 text-gray-500">No Graphics Yet</div>
      ) : (
        <InteractiveGraphics graphics={visualization} />
      )}
      <PipelineStageTable
        pipelineSolver={solver}
        triggerRender={() => incRenderCount()}
      />
    </div>
  )
}
