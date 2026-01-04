import React, { useEffect, useMemo, useReducer, useState } from "react"
import type { BaseSolver } from "../BaseSolver"
import type { BasePipelineSolver } from "../BasePipelineSolver"
import {
  InteractiveGraphics,
  InteractiveGraphicsCanvas,
} from "graphics-debug/react"
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
  solver?: BaseSolver
  createSolver?: () => BaseSolver
  animationSpeed?: number
  onSolverStarted?: (solver: BaseSolver) => void
  onSolverCompleted?: (solver: BaseSolver) => void
}

export const GenericSolverDebugger = ({
  solver: solverProp,
  createSolver,
  animationSpeed = 25,
  onSolverStarted,
  onSolverCompleted,
}: GenericSolverDebuggerProps) => {
  const [renderCount, incRenderCount] = useReducer((x) => x + 1, 0)
  const [solver] = useState<BaseSolver>(() => {
    if (createSolver) {
      return createSolver()
    }
    if (!solverProp) {
      throw new Error("GenericSolverDebugger requires solver or createSolver")
    }
    return solverProp
  })
  const [renderer, setRenderer] = useState<"vector" | "canvas">(() => {
    if (typeof window === "undefined") return "vector"
    const stored = window.localStorage.getItem("solver-utils-renderer")
    return stored === "canvas" ? "canvas" : "vector"
  })
  const [currentAnimationSpeed, setCurrentAnimationSpeed] =
    useState(animationSpeed)

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

  useEffect(() => {
    setCurrentAnimationSpeed(animationSpeed)
  }, [animationSpeed])

  const isPipelineSolver = (solver as any).pipelineDef !== undefined

  const handleStepUntilPhase = (phaseName: string) => {
    const pipelineSolver = solver as BasePipelineSolver<any>
    if (!solver.solved && !solver.failed) {
      // Step until the specified phase is completed
      while (
        !solver.solved &&
        !solver.failed &&
        pipelineSolver.currentPipelineStageIndex <=
          pipelineSolver.pipelineDef.findIndex(
            (s) => s.solverName === phaseName,
          )
      ) {
        solver.step()
      }
      incRenderCount()
    }
  }

  const handleDownloadVisualization = () => {
    const visualizationJson = JSON.stringify(visualization, null, 2)
    const blob = new Blob([visualizationJson], {
      type: "application/json",
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.download = "visualization.json"
    a.href = url
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleRendererChange = (nextRenderer: "vector" | "canvas") => {
    setRenderer(nextRenderer)
    if (typeof window !== "undefined") {
      window.localStorage.setItem("solver-utils-renderer", nextRenderer)
    }
  }

  return (
    <div>
      <GenericSolverToolbar
        solver={solver}
        triggerRender={incRenderCount}
        animationSpeed={currentAnimationSpeed}
        renderer={renderer}
        onRendererChange={handleRendererChange}
        onAnimationSpeedChange={setCurrentAnimationSpeed}
        onDownloadVisualization={handleDownloadVisualization}
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
          {renderer === "canvas" ? (
            <InteractiveGraphicsCanvas graphics={visualization} />
          ) : (
            <InteractiveGraphics graphics={visualization} />
          )}
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
