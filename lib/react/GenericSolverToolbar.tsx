import React, { useReducer, useRef, useEffect, useMemo, useState } from "react"
import type { BaseSolver } from "../BaseSolver"
import { SolverBreadcrumbInputDownloader } from "./SolverBreadcrumbInputDownloader"

type RendererOption = "vector" | "canvas"

const stringifyStatValue = (value: unknown): string => {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return String(value)
    }

    if (Number.isInteger(value)) {
      return String(value)
    }

    if (Math.abs(value) >= 1000 || Math.abs(value) < 0.01) {
      return value.toExponential(1)
    }

    return value
      .toFixed(2)
      .replace(/\.0+$/, "")
      .replace(/(\.\d*[1-9])0+$/, "$1")
  }

  if (typeof value === "string") {
    return value
  }

  if (typeof value === "boolean") {
    return value ? "true" : "false"
  }

  if (value === null || value === undefined) {
    return String(value)
  }

  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

const getStatsSummarySegments = (stats: Record<string, unknown>) => {
  return Object.entries(stats).map(([key, value]) => ({
    key,
    text: `${key}: ${stringifyStatValue(value)}`,
    widthCh: Math.max(key.length + 8, 12),
  }))
}

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

  const statsSegments = useMemo(() => {
    if (!solver.stats || Object.keys(solver.stats).length === 0) {
      return []
    }

    return getStatsSummarySegments(solver.stats)
  }, [solver.stats])

  const fullStatsJson = useMemo(() => {
    if (!solver.stats || Object.keys(solver.stats).length === 0) {
      return ""
    }

    return JSON.stringify(solver.stats, null, 2)
  }, [solver.stats])

  const startAnimation = () => {
    const intervalMs = Math.max(1, animationSpeed)
    const stepsPerTick = animationSpeed < 1 ? Math.round(1 / animationSpeed) : 1

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

      for (let i = 0; i < stepsPerTick; i++) {
        if (solver.solved || solver.failed) break
        solver.step()
      }

      triggerRender()
    }, intervalMs)
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
    <div className="space-y-2 border-b p-2">
      <div className="flex items-center gap-3">
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

        {statsSegments.length > 0 && (
          <div className="group relative ml-auto min-w-0 flex-1 overflow-visible">
            <div className="ml-auto flex max-w-[120ch] justify-end gap-2 overflow-hidden whitespace-nowrap text-xs text-slate-600">
              {statsSegments.map((segment) => (
                <span
                  key={segment.key}
                  className="inline-block overflow-hidden text-ellipsis rounded border border-slate-200 bg-slate-50 px-2 py-1 font-mono tabular-nums"
                  style={{ width: `${segment.widthCh}ch` }}
                >
                  {segment.text}
                </span>
              ))}
            </div>
            <pre className="pointer-events-none absolute right-0 top-full z-50 mt-1 hidden max-w-[min(40rem,90vw)] overflow-auto whitespace-pre-wrap rounded-md border border-slate-200 bg-slate-950 px-3 py-2 font-mono text-xs leading-5 text-slate-100 shadow-xl group-hover:block">
              {fullStatsJson}
            </pre>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={handleStep}
          disabled={solver.solved || solver.failed || isAnimating}
          className="rounded bg-blue-500 px-3 py-1 text-sm text-white hover:bg-blue-600 disabled:bg-gray-300"
        >
          Step
        </button>

        <button
          onClick={handleSolve}
          disabled={solver.solved || solver.failed || isAnimating}
          className="rounded bg-green-500 px-3 py-1 text-sm text-white hover:bg-green-600 disabled:bg-gray-300"
        >
          Solve
        </button>

        <button
          onClick={handleAnimate}
          disabled={solver.solved || solver.failed}
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
          disabled={solver.solved || solver.failed || isAnimating}
          className="rounded bg-orange-500 px-3 py-1 text-sm text-white hover:bg-orange-600 disabled:bg-gray-300"
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

      {solver.error && (
        <div className="text-sm text-red-600">Error: {solver.error}</div>
      )}
    </div>
  )
}
