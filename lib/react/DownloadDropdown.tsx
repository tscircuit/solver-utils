import React, { useEffect, useRef, useState } from "react"
import type { BaseSolver } from "../BaseSolver"

const downloadJSON = (filename: string, data: any) => {
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

const timestamp = () =>
  new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19)

export const DownloadDropdown = ({ solver }: { solver: BaseSolver }) => {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!ref.current) return
      if (!ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", onDocClick)
    return () => document.removeEventListener("mousedown", onDocClick)
  }, [])

  useEffect(() => {
    if (!open) return
    // Focus first menu item when opening
    const t = requestAnimationFrame(() => {
      const first = menuRef.current?.querySelector("button")
      if (first instanceof HTMLButtonElement) first.focus()
    })
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false)
      }
    }
    document.addEventListener("keydown", onKey)
    return () => {
      cancelAnimationFrame(t)
      document.removeEventListener("keydown", onKey)
    }
  }, [open])

  const solverName = solver.constructor.name

  const handleDownload = (
    kind: "params" | "visualization" | "preview" | "stats",
  ) => {
    let data: any
    try {
      if (kind === "params") {
        data = { constructorParams: solver.getConstructorParams() }
      } else if (kind === "visualization") {
        data = solver.visualize()
      } else if (kind === "preview") {
        data = solver.preview()
      } else {
        data = {
          stats: solver.stats,
          iterations: solver.iterations,
          solved: solver.solved,
          failed: solver.failed,
          error: solver.error ?? undefined,
          timeToSolve: solver.timeToSolve ?? undefined,
        }
      }
    } catch (e) {
      data = { error: String(e) }
    }

    const fname = `${solverName}.${kind}.${timestamp()}.json`
    downloadJSON(fname, data)
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        className="bg-gray-500 hover:bg-gray-600 text-white px-3 py-1 rounded text-sm"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title={`Download data for ${solverName}`}
      >
        {solverName} ▼
      </button>
      {open && (
        <div
          ref={menuRef}
          className="absolute z-10 mt-1 w-56 rounded-md border bg-white shadow-lg"
          role="menu"
          aria-label={`${solverName} menu`}
        >
          <div className="py-1 text-sm">
            <button
              className="w-full text-left px-3 py-2 hover:bg-gray-100"
              role="menuitem"
              tabIndex={-1}
              onClick={() => handleDownload("params")}
            >
              Download constructor params (JSON)
            </button>
            <button
              className="w-full text-left px-3 py-2 hover:bg-gray-100"
              role="menuitem"
              tabIndex={-1}
              onClick={() => handleDownload("visualization")}
            >
              Download visualization (JSON)
            </button>
            <button
              className="w-full text-left px-3 py-2 hover:bg-gray-100"
              role="menuitem"
              tabIndex={-1}
              onClick={() => handleDownload("preview")}
            >
              Download preview (JSON)
            </button>
            <button
              className="w-full text-left px-3 py-2 hover:bg-gray-100"
              role="menuitem"
              tabIndex={-1}
              onClick={() => handleDownload("stats")}
            >
              Download stats (JSON)
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
