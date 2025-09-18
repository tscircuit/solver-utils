import React, { useMemo, useReducer } from "react"
import type { BaseSolver } from "../BaseSolver"
import { InteractiveGraphics } from "graphics-debug/react"
import { GenericSolverToolbar } from "./GenericSolverToolbar"

export interface GenericSolverDebuggerProps {
  solver: BaseSolver
  animationSpeed?: number
  onSolverStarted?: (solver: BaseSolver) => void
  onSolverCompleted?: (solver: BaseSolver) => void
}

export const GenericSolverDebugger = ({
  solver,
  animationSpeed = 25,
  onSolverStarted,
  onSolverCompleted,
}: GenericSolverDebuggerProps) => {
  const [, incRenderCount] = useReducer((x) => x + 1, 0)

  const visualization = useMemo(() => {
    try {
      return solver.visualize() || { points: [], lines: [], rects: [], circles: [] }
    } catch (error) {
      console.error("Visualization error:", error)
      return { points: [], lines: [], rects: [], circles: [] }
    }
  }, [solver, incRenderCount])

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
      />
      {graphicsAreEmpty ? (
        <div className="p-4 text-gray-500">No Graphics Yet</div>
      ) : (
        <InteractiveGraphics graphics={visualization} />
      )}
    </div>
  )
}
