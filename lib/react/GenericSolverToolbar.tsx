import React, { useReducer, useRef, useEffect, useMemo, useState } from "react"
import type { BaseSolver } from "../BaseSolver"
import { SolverBreadcrumbInputDownloader } from "./SolverBreadcrumbInputDownloader"

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
}: GenericSolverToolbarProps) => {
  const [isAnimating, setIsAnimating] = useReducer((x) => !x, false)
  const animationRef = useRef<NodeJS.Timeout | undefined>(undefined)
  const lastIterationInputRef = useRef<string | null>(null)
  const lastIterationStorageKey = "solver-debugger-last-iteration"
  const [openMenu, setOpenMenu] = useState<
    "renderer" | "debug" | "animation" | null
  >(null)
  const menuContainerRef = useRef<HTMLDivElement | null>(null)

  const animationSpeedOptions = useMemo(
    () => [
      { label: "Slow", value: 250 },
      { label: "Normal", value: 100 },
      { label: "Fast", value: 25 },
      { label: "Very Fast", value: 10 },
    ],
    [],
  )

  const startAnimation = () => {
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

  const stopAnimation = () => {
    if (animationRef.current) {
      clearInterval(animationRef.current)
      animationRef.current = undefined
    }
  }

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
      stopAnimation()
      setIsAnimating()
    } else {
      setIsAnimating()
      startAnimation()
    }
  }

  const handleStepUntilIteration = () => {
    if (solver.solved || solver.failed || isAnimating) return

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

    while (
      solver.iterations < targetIteration &&
      !solver.solved &&
      !solver.failed
    ) {
      solver.step()
    }

    triggerRender()

    if (solver.solved && onSolverCompleted) {
      onSolverCompleted(solver)
    }
  }

  // Cleanup animation on unmount or solver completion
  useEffect(() => {
    return () => {
      stopAnimation()
    }
  }, [])

  useEffect(() => {
    if ((solver.solved || solver.failed) && isAnimating) {
      stopAnimation()
      setIsAnimating()
    }
  }, [solver.solved, solver.failed, isAnimating])

  useEffect(() => {
    if (isAnimating) {
      stopAnimation()
      startAnimation()
    }
  }, [animationSpeed, isAnimating])

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
    <div className="space-y-2 p-2 border-b">
      <div className="flex items-center">
        <div className="flex items-center gap-2" ref={menuContainerRef}>
          <div className="flex h-9 items-center space-x-1 rounded-md border border-slate-200 bg-white p-1 shadow-sm">
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
                  {(["vector", "canvas"] as RendererOption[]).map((option) => (
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
                  ))}
                </div>
              )}
            </div>
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
                        {option.value}ms
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
      </div>
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

        <button
          onClick={handleStepUntilIteration}
          disabled={solver.solved || solver.failed || isAnimating}
          className="bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 text-white px-3 py-1 rounded text-sm"
        >
          Step Until Iteration
        </button>

        <div className="text-sm text-gray-600">
          Iterations: {solver.iterations}
        </div>

        {solver.timeToSolve !== undefined && (
          <div className="text-sm text-gray-600">
            Time: {(solver.timeToSolve / 1000).toFixed(3)}s
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
      </div>

      {solver.error && (
        <div className="text-red-600 text-sm">Error: {solver.error}</div>
      )}
    </div>
  )
}
