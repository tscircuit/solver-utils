import React, { useEffect, useMemo, useReducer } from "react"
import type { ReactNode } from "react"
import type { BaseSolver } from "../BaseSolver"
import { InteractiveGraphics } from "graphics-debug/react"
import { GenericSolverToolbar } from "./GenericSolverToolbar"

export interface GenericSolverDebuggerProps {
  solver: BaseSolver
  animationSpeed?: number
  onSolverStarted?: (solver: BaseSolver) => void
  onSolverCompleted?: (solver: BaseSolver) => void
  renderBelowVisualizer?: (args: {
    solver: BaseSolver
    triggerRender: () => void
  }) => ReactNode
}

export const GenericSolverDebugger = ({
  solver,
  animationSpeed = 25,
  onSolverStarted,
  onSolverCompleted,
  renderBelowVisualizer,
}: GenericSolverDebuggerProps) => {
  const [renderCount, incRenderCount] = useReducer((x) => x + 1, 0)

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
      />
      {graphicsAreEmpty ? (
        <div className="p-4 text-gray-500">No Graphics Yet</div>
      ) : (
        <InteractiveGraphics graphics={visualization} />
      )}
      {renderBelowVisualizer?.({ solver, triggerRender: incRenderCount })}
    </div>
  )
}
