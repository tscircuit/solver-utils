import React, { useReducer, useRef, useEffect } from "react"
import type { BaseSolver } from "../BaseSolver"
import type { BasePipelineSolver } from "../BasePipelineSolver"
import { SolverBreadcrumbInputDownloader } from "./SolverBreadcrumbInputDownloader"

export interface GenericSolverToolbarProps {
  solver: BaseSolver
  triggerRender: () => void
  animationSpeed?: number
  onSolverStarted?: (solver: BaseSolver) => void
  onSolverCompleted?: (solver: BaseSolver) => void
}

export const GenericSolverToolbar = ({
  solver,
  triggerRender,
  animationSpeed = 25,
  onSolverStarted,
  onSolverCompleted,
}: GenericSolverToolbarProps) => {
  const [isAnimating, setIsAnimating] = useReducer((x) => !x, false)
  const animationRef = useRef<NodeJS.Timeout | undefined>(undefined)

  const handleStep = () => {
    if (!solver.solved && !solver.failed) {
      solver.step()
      triggerRender()
    }
  }

  const handleSolve = () => {
    if (!solver.solved && !solver.failed) {
      if (onSolverStarted) {
        onSolverStarted(solver)
      }
      solver.solve()
      triggerRender()
      if (onSolverCompleted) {
        onSolverCompleted(solver)
      }
    }
  }

  const handleAnimate = () => {
    if (isAnimating) {
      if (animationRef.current) {
        clearInterval(animationRef.current)
        animationRef.current = undefined
      }
      setIsAnimating()
    } else {
      setIsAnimating()
      animationRef.current = setInterval(() => {
        if (solver.solved || solver.failed) {
          if (animationRef.current) {
            clearInterval(animationRef.current)
            animationRef.current = undefined
          }
          setIsAnimating()
          triggerRender()
          if (onSolverCompleted && solver.solved) {
            onSolverCompleted(solver)
          }
          return
        }
        solver.step()
        triggerRender()
      }, animationSpeed)
    }
  }

  const handleNextStage = () => {
    const pipelineSolver = solver as BasePipelineSolver<any>
    if (pipelineSolver.getCurrentPhase && !solver.solved && !solver.failed) {
      const initialPhase = pipelineSolver.getCurrentPhase()

      // Step until we get to a different phase or solve/fail
      while (
        pipelineSolver.getCurrentPhase() === initialPhase &&
        !solver.solved &&
        !solver.failed
      ) {
        solver.step()
      }
      triggerRender()
    }
  }

  // Cleanup animation on unmount or solver completion
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        clearInterval(animationRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if ((solver.solved || solver.failed) && isAnimating) {
      if (animationRef.current) {
        clearInterval(animationRef.current)
        animationRef.current = undefined
      }
      setIsAnimating()
    }
  }, [solver.solved, solver.failed, isAnimating])

  const isPipelineSolver = (solver as any).getCurrentPhase !== undefined
  const currentPhase = isPipelineSolver
    ? (solver as BasePipelineSolver<any>).getCurrentPhase()
    : null

  return (
    <div className="space-y-2 p-2 border-b">
      <div className="flex gap-2 items-center flex-wrap">
        <button
          onClick={handleStep}
          disabled={solver.solved || solver.failed || isAnimating}
          className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white px-3 py-1 rounded text-sm"
        >
          Step
        </button>

        <button
          onClick={handleSolve}
          disabled={solver.solved || solver.failed || isAnimating}
          className="bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white px-3 py-1 rounded text-sm"
        >
          Solve
        </button>

        <button
          onClick={handleAnimate}
          disabled={solver.solved || solver.failed}
          className={`px-3 py-1 rounded text-white text-sm ${
            isAnimating
              ? "bg-red-500 hover:bg-red-600"
              : "bg-yellow-500 hover:bg-yellow-600"
          } disabled:bg-gray-300`}
        >
          {isAnimating ? "Stop" : "Animate"}
        </button>

        {isPipelineSolver && (
          <button
            onClick={handleNextStage}
            disabled={solver.solved || solver.failed || isAnimating}
            className="bg-purple-500 hover:bg-purple-600 disabled:bg-gray-300 text-white px-3 py-1 rounded text-sm"
          >
            Next Stage
          </button>
        )}

        <div className="text-sm text-gray-600">
          Iterations: {solver.iterations}
        </div>

        {solver.timeToSolve !== undefined && (
          <div className="text-sm text-gray-600">
            Time: {(solver.timeToSolve / 1000).toFixed(3)}s
          </div>
        )}

        {currentPhase && (
          <div className="text-sm text-gray-600">
            Phase: <span className="font-medium">{currentPhase}</span>
          </div>
        )}

        {solver.solved && (
          <div className="px-2 py-1 bg-green-100 text-green-800 rounded text-sm">
            Solved
          </div>
        )}

        {solver.failed && (
          <div className="px-2 py-1 bg-red-100 text-red-800 rounded text-sm">
            Failed
          </div>
        )}
        <div className="ml-auto">
          <SolverBreadcrumbInputDownloader solver={solver} />
        </div>
      </div>

      {solver.error && (
        <div className="text-red-600 text-sm">Error: {solver.error}</div>
      )}
    </div>
  )
}
