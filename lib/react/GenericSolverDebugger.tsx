import React, { useEffect, useMemo, useReducer } from "react"
import type { BaseSolver } from "../BaseSolver"
import type { BasePipelineSolver } from "../BasePipelineSolver"
import { InteractiveGraphics } from "graphics-debug/react"
import { GenericSolverToolbar } from "./GenericSolverToolbar"
import { PipelineStagesTable } from "./PipelineStagesTable"
import { SimpleGraphicsSVG } from "./SimpleGraphicsSVG"
import type { GraphicsObject } from "graphics-debug"

class ErrorBoundary extends React.Component<
  { fallback: React.ReactNode; children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { fallback: React.ReactNode; children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }
  static getDerivedStateFromError() {
    return { hasError: true }
  }
  override componentDidCatch(error: any) {
    console.error("InteractiveGraphics render error:", error)
  }
  override render() {
    if (this.state.hasError) {
      return this.props.fallback
    }
    return this.props.children
  }
}

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

  const isPipelineSolver = (solver as any).pipelineDef !== undefined

  const handleStepUntilPhase = (phaseName: string) => {
    const pipelineSolver = solver as BasePipelineSolver<any>
    if (!solver.solved && !solver.failed) {
      // Step until the specified phase is completed
      while (
        !solver.solved &&
        !solver.failed &&
        pipelineSolver.currentPipelineStepIndex <=
          pipelineSolver.pipelineDef.findIndex(
            (s) => s.solverName === phaseName,
          )
      ) {
        solver.step()
      }
      incRenderCount()
    }
  }

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
        <ErrorBoundary
          fallback={
            <SimpleGraphicsSVG graphics={visualization as GraphicsObject} />
          }
        >
          <InteractiveGraphics graphics={visualization} />
        </ErrorBoundary>
      )}
      {isPipelineSolver && (
        <PipelineStagesTable
          solver={solver as BasePipelineSolver<any>}
          onStepUntilPhase={handleStepUntilPhase}
          triggerRender={incRenderCount}
        />
      )}
    </div>
  )
}
