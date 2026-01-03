import { useEffect, useRef, useState } from "react"

type RendererOption = "vector" | "canvas"

const animationOptions = [
  { label: "1s / step", value: 1000 },
  { label: "500ms / step", value: 500 },
  { label: "250ms / step", value: 250 },
  { label: "100ms / step", value: 100 },
  { label: "50ms / step", value: 50 },
  { label: "25ms / step", value: 25 },
  { label: "10ms / step", value: 10 },
]

export const SolverContextMenu = ({
  renderer,
  onRendererChange,
  animationSpeed,
  onAnimationSpeedChange,
  onDownloadVisualization,
}: {
  renderer: RendererOption
  onRendererChange: (renderer: RendererOption) => void
  animationSpeed: number
  onAnimationSpeedChange: (speed: number) => void
  onDownloadVisualization: () => void
}) => {
  const [openMenu, setOpenMenu] = useState<
    "renderer" | "debug" | "animation" | null
  >(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenu(null)
      }
    }

    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const renderMenuItem = (
    label: string,
    isSelected: boolean,
    onClick: () => void,
  ) => (
    <button
      type="button"
      className="flex w-full items-center justify-between px-4 py-2 text-sm hover:bg-slate-800"
      onClick={onClick}
    >
      <span>{label}</span>
      {isSelected && <span className="text-sm">✓</span>}
    </button>
  )

  return (
    <div
      className="flex items-center gap-4 text-sm font-semibold"
      ref={menuRef}
    >
      <div className="relative">
        <button
          type="button"
          className="px-2 py-1 text-gray-700 hover:text-gray-900"
          onClick={() =>
            setOpenMenu((menu) => (menu === "renderer" ? null : "renderer"))
          }
        >
          Renderer
        </button>
        {openMenu === "renderer" && (
          <div className="absolute left-0 top-full z-20 mt-2 w-48 rounded-xl bg-slate-900 text-white shadow-lg ring-1 ring-black/20">
            {renderMenuItem("Canvas", renderer === "canvas", () => {
              onRendererChange("canvas")
              setOpenMenu(null)
            })}
            {renderMenuItem("Vector", renderer === "vector", () => {
              onRendererChange("vector")
              setOpenMenu(null)
            })}
          </div>
        )}
      </div>

      <div className="relative">
        <button
          type="button"
          className="px-2 py-1 text-gray-700 hover:text-gray-900"
          onClick={() =>
            setOpenMenu((menu) => (menu === "debug" ? null : "debug"))
          }
        >
          Debug
        </button>
        {openMenu === "debug" && (
          <div className="absolute left-0 top-full z-20 mt-2 w-64 rounded-xl bg-slate-900 text-white shadow-lg ring-1 ring-black/20">
            <button
              type="button"
              className="flex w-full items-center justify-between px-4 py-2 text-sm hover:bg-slate-800"
              onClick={() => {
                onDownloadVisualization()
                setOpenMenu(null)
              }}
            >
              Download Visualization
            </button>
          </div>
        )}
      </div>

      <div className="relative">
        <button
          type="button"
          className="px-2 py-1 text-gray-700 hover:text-gray-900"
          onClick={() =>
            setOpenMenu((menu) => (menu === "animation" ? null : "animation"))
          }
        >
          Animation
        </button>
        {openMenu === "animation" && (
          <div className="absolute left-0 top-full z-20 mt-2 w-56 rounded-xl bg-slate-900 text-white shadow-lg ring-1 ring-black/20">
            {animationOptions.map((option) =>
              renderMenuItem(
                option.label,
                animationSpeed === option.value,
                () => {
                  onAnimationSpeedChange(option.value)
                  setOpenMenu(null)
                },
              ),
            )}
          </div>
        )}
      </div>
    </div>
  )
}
