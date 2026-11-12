import React, { useEffect, useMemo, useRef, useState } from "react"
import type { BaseSolver } from "../BaseSolver"
import { GenericSolverStatsSummary } from "./GenericSolverStatsSummary"
import { SolverBreadcrumbInputDownloader } from "./SolverBreadcrumbInputDownloader"
import { useSolverActions } from "./useSolverActions"

type RendererOption = "vector" | "canvas"

export interface GenericSolverToolbarProps {
  solver: BaseSolver
  triggerRender: () => void
  animationSpeed?: number
  renderer: RendererOption
  onRendererChange: (renderer: RendererOption) => void
  onAnimationSpeedChange: (speed: number) => void
  onDownloadVisualization: () => void
  onSolverStarted?: (solver: BaseSolver) => void
  onSolverCompleted?: (solver: BaseSolver) => void
  customRendererName?: string
}

export const GenericSolverToolbar = ({
  solver,
  triggerRender,
  animationSpeed = 25,
  renderer,
  onRendererChange,
  onAnimationSpeedChange,
  onDownloadVisualization,
  onSolverStarted,
  onSolverCompleted,
  customRendererName,
}: GenericSolverToolbarProps) => {
  const [isAnimating, setIsAnimating] = useState(false)
  const animatingRef = useRef(false)
  const speedRef = useRef(animationSpeed)
  speedRef.current = animationSpeed
  const { isRunning, actionError, run } = useSolverActions(
    solver,
    triggerRender,
  )
  const lastIterationInputRef = useRef<string | null>(null)
  const lastIterationStorageKey = "solver-debugger-last-iteration"
  const [openMenu, setOpenMenu] = useState<
    "renderer" | "debug" | "animation" | null
  >(null)
  const menuContainerRef = useRef<HTMLDivElement | null>(null)

  const animationSpeedOptions = useMemo(
    () => [
      { label: "Slow", value: 250, description: "250ms" },
      { label: "Normal", value: 100, description: "100ms" },
      { label: "Fast", value: 10, description: "10ms" },
      { label: "Fast (2x)", value: 5, description: "5ms" },
      { label: "Fast (10x)", value: 1, description: "1ms" },
      { label: "Fast 20x", value: 0.5, description: "2 steps / 1ms" },
      { label: "Fast 100x", value: 0.1, description: "10 steps / 1ms" },
    ],
    [],
  )

  const stopAnimation = () => {
    animatingRef.current = false
  }

  const handleStep = () => {
    return run(async (step) => {
      await step()
    })
  }

  const handleSolve = () => {
    return run(async (step) => {
      onSolverStarted?.(solver)
      const start = Date.now()
      while (!solver.solved && !solver.failed) {
        await step()
      }
      solver.timeToSolve = Date.now() - start
      onSolverCompleted?.(solver)
    })
  }

  const handleAnimate = () => {
    if (animatingRef.current) {
      stopAnimation()
      setIsAnimating(false)
      return
    }
    return run(async (step) => {
      animatingRef.current = true
      setIsAnimating(true)
      try {
        while (animatingRef.current && !solver.solved && !solver.failed) {
          const speed = speedRef.current
          await new Promise((resolve) =>
            setTimeout(resolve, Math.max(1, speed)),
          )
          const stepsPerTick = speed < 1 ? Math.round(1 / speed) : 1
          for (let i = 0; i < stepsPerTick; i++) {
            if (!animatingRef.current || solver.solved || solver.failed) break
            await step()
          }
        }
        if (solver.solved) onSolverCompleted?.(solver)
      } finally {
        if (animatingRef.current) setIsAnimating(false)
        stopAnimation()
      }
    })
  }

  const handleStepUntilIteration = () => {
    if (solver.solved || solver.failed || isRunning) return

    if (
      lastIterationInputRef.current === null &&
      typeof window !== "undefined"
    ) {
      lastIterationInputRef.current = window.localStorage.getItem(
        lastIterationStorageKey,
      )
    }

    const targetIterationInput = window.prompt(
      "Step until which iteration?",
      lastIterationInputRef.current ?? `${solver.iterations}`,
    )

    if (targetIterationInput === null) return

    lastIterationInputRef.current = targetIterationInput
    if (typeof window !== "undefined") {
      window.localStorage.setItem(lastIterationStorageKey, targetIterationInput)
    }

    const targetIteration = Number(targetIterationInput)

    if (!Number.isFinite(targetIteration)) {
      window.alert("Please enter a valid number for the iteration")
      return
    }

    return run(async (step) => {
      while (
        solver.iterations < targetIteration &&
        !solver.solved &&
        !solver.failed
      ) {
        await step()
      }
      if (solver.solved) onSolverCompleted?.(solver)
    })
  }

  // Cleanup animation on unmount or solver completion
  useEffect(() => {
    return () => {
      stopAnimation()
    }
  }, [])

  useEffect(() => {
    if (typeof document === "undefined") return
    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuContainerRef.current &&
        !menuContainerRef.current.contains(event.target as Node)
      ) {
        setOpenMenu(null)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [])

  return (
    <div className="space-y-2 border-b p-2">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2" ref={menuContainerRef}>
          <div className="flex h-9 items-center space-x-1 rounded-md border border-slate-200 bg-white p-1 shadow-sm">
            {customRendererName ? (
              <span className="px-3 py-1 text-sm font-medium">
                {customRendererName}
              </span>
            ) : (
              <div className="relative">
                <button
                  type="button"
                  onClick={() =>
                    setOpenMenu(openMenu === "renderer" ? null : "renderer")
                  }
                  className="flex select-none items-center rounded-sm px-3 py-1 text-sm font-medium outline-none focus:bg-slate-100 data-[state=open]:bg-slate-100"
                  data-state={openMenu === "renderer" ? "open" : "closed"}
                >
                  Renderer
                </button>
                {openMenu === "renderer" && (
                  <div className="absolute left-0 z-50 mt-1 min-w-[10rem] rounded-md border border-slate-200 bg-white p-1 text-slate-950 shadow-md">
                    {(["vector", "canvas"] as RendererOption[]).map(
                      (option) => (
                        <button
                          type="button"
                          key={option}
                          onClick={() => {
                            onRendererChange(option)
                            setOpenMenu(null)
                          }}
                          className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm hover:bg-slate-100"
                        >
                          {option === "vector" ? "Vector" : "Canvas"}
                          {renderer === option && (
                            <span className="ml-auto text-xs text-slate-500">
                              ✓
                            </span>
                          )}
                        </button>
                      ),
                    )}
                  </div>
                )}
              </div>
            )}
            <div className="relative">
              <button
                type="button"
                onClick={() =>
                  setOpenMenu(openMenu === "debug" ? null : "debug")
                }
                className="flex select-none items-center rounded-sm px-3 py-1 text-sm font-medium outline-none focus:bg-slate-100 data-[state=open]:bg-slate-100"
                data-state={openMenu === "debug" ? "open" : "closed"}
              >
                Debug
              </button>
              {openMenu === "debug" && (
                <div className="absolute left-0 z-50 mt-1 min-w-[12rem] rounded-md border border-slate-200 bg-white p-1 text-slate-950 shadow-md">
                  <button
                    type="button"
                    onClick={() => {
                      onDownloadVisualization()
                      setOpenMenu(null)
                    }}
                    className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm hover:bg-slate-100"
                  >
                    Download Visualization
                  </button>
                </div>
              )}
            </div>
            <div className="relative">
              <button
                type="button"
                onClick={() =>
                  setOpenMenu(openMenu === "animation" ? null : "animation")
                }
                className="flex select-none items-center rounded-sm px-3 py-1 text-sm font-medium outline-none focus:bg-slate-100 data-[state=open]:bg-slate-100"
                data-state={openMenu === "animation" ? "open" : "closed"}
              >
                Animation
              </button>
              {openMenu === "animation" && (
                <div className="absolute left-0 z-50 mt-1 min-w-[12rem] rounded-md border border-slate-200 bg-white p-1 text-slate-950 shadow-md">
                  {animationSpeedOptions.map((option) => (
                    <button
                      type="button"
                      key={option.value}
                      onClick={() => {
                        onAnimationSpeedChange(option.value)
                        setOpenMenu(null)
                      }}
                      className="flex w-full items-center rounded-sm px-2 py-1.5 text-sm hover:bg-slate-100"
                    >
                      {option.label}
                      <span className="ml-auto text-xs text-slate-500">
                        {option.description}
                      </span>
                      {animationSpeed === option.value && (
                        <span className="ml-2 text-xs text-slate-500">✓</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <SolverBreadcrumbInputDownloader solver={solver} />
        </div>

        {solver.stats && Object.keys(solver.stats).length > 0 && (
          <GenericSolverStatsSummary
            solverName={solver.getSolverName()}
            stats={solver.stats}
          />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={handleStep}
          disabled={solver.solved || solver.failed || isRunning}
          className="rounded bg-blue-500 px-3 py-1 text-sm text-white hover:bg-blue-600 disabled:bg-gray-300"
        >
          Step
        </button>

        <button
          onClick={handleSolve}
          disabled={solver.solved || solver.failed || isRunning}
          className="rounded bg-green-500 px-3 py-1 text-sm text-white hover:bg-green-600 disabled:bg-gray-300"
        >
          Solve
        </button>

        <button
          onClick={handleAnimate}
          disabled={
            solver.solved || solver.failed || (isRunning && !isAnimating)
          }
          className={`rounded px-3 py-1 text-sm text-white ${
            isAnimating
              ? "bg-red-500 hover:bg-red-600"
              : "bg-yellow-500 hover:bg-yellow-600"
          } disabled:bg-gray-300`}
        >
          {isAnimating ? "Stop" : "Animate"}
        </button>

        <button
          onClick={handleStepUntilIteration}
          disabled={solver.solved || solver.failed || isRunning}
          className="rounded bg-orange-500 px-3 py-1 text-sm text-white hover:bg-orange-600 disabled:bg-gray-300"
        >
          Step Until Iteration
        </button>

        <div className="text-sm text-gray-600">
          Iterations: {solver.iterations}
        </div>

        {isRunning && <div role="status">Running</div>}

        {solver.timeToSolve !== undefined && (
          <div className="text-sm text-gray-600">
            Time: {(solver.timeToSolve / 1000).toFixed(3)}s
          </div>
        )}

        {solver.solved && (
          <div className="rounded bg-green-100 px-2 py-1 text-sm text-green-800">
            Solved
          </div>
        )}

        {solver.failed && (
          <div className="rounded bg-red-100 px-2 py-1 text-sm text-red-800">
            Failed
          </div>
        )}
      </div>

      {(solver.error || actionError) && (
        <div className="text-sm text-red-600">
          Error: {solver.error || actionError}
        </div>
      )}
    </div>
  )
}
