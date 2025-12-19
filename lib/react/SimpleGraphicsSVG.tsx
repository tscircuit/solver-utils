import React from "react"
import type { GraphicsObject } from "graphics-debug"

export function SimpleGraphicsSVG({ graphics }: { graphics: GraphicsObject }) {
  const points = graphics.points ?? []
  const lines = graphics.lines ?? []
  const rects = graphics.rects ?? []
  const circles = graphics.circles ?? []
  const texts = (graphics as any).texts ?? []

  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY

  const consider = (x?: number, y?: number) => {
    if (typeof x === "number") {
      if (x < minX) minX = x
      if (x > maxX) maxX = x
    }
    if (typeof y === "number") {
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
  }

  for (const p of points) consider((p as any).x, (p as any).y)
  for (const l of lines) {
    const pts = (l as any).points ?? []
    for (const p of pts) consider(p.x, p.y)
  }
  for (const r of rects) {
    const x = (r as any).x ?? 0
    const y = (r as any).y ?? 0
    const w = (r as any).width ?? 0
    const h = (r as any).height ?? 0
    consider(x, y)
    consider(x + w, y + h)
  }
  for (const c of circles) {
    const x = (c as any).x ?? 0
    const y = (c as any).y ?? 0
    const rad = (c as any).radius ?? 1
    consider(x - rad, y - rad)
    consider(x + rad, y + rad)
  }
  for (const t of texts) consider((t as any).x, (t as any).y)

  if (
    !isFinite(minX) ||
    !isFinite(minY) ||
    !isFinite(maxX) ||
    !isFinite(maxY)
  ) {
    minX = -20
    minY = -20
    maxX = 20
    maxY = 20
  }

  const pad = 10
  const vbX = minX - pad
  const vbY = minY - pad
  const vbW = Math.max(1, maxX - minX + 2 * pad)
  const vbH = Math.max(1, maxY - minY + 2 * pad)

  return (
    <svg
      className="w-full h-[400px] bg-white"
      viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
      role="img"
      aria-label="Graphics fallback"
    >
      {rects.map((r: any, i: number) => (
        <rect
          key={`rect-${i}`}
          x={r.x ?? 0}
          y={r.y ?? 0}
          width={r.width ?? 0}
          height={r.height ?? 0}
          fill="none"
          stroke={r.strokeColor ?? "black"}
          strokeWidth={r.strokeWidth ?? 1}
        />
      ))}
      {lines.map((l: any, i: number) => (
        <polyline
          key={`line-${i}`}
          fill="none"
          stroke={l.strokeColor ?? "black"}
          strokeWidth={l.strokeWidth ?? 1}
          points={(l.points ?? [])
            .map((p: any) => `${p.x ?? 0},${p.y ?? 0}`)
            .join(" ")}
        />
      ))}
      {circles.map((c: any, i: number) => (
        <circle
          key={`circle-${i}`}
          cx={c.x ?? 0}
          cy={c.y ?? 0}
          r={c.radius ?? 1.5}
          fill={c.fillColor ?? "none"}
          stroke={c.strokeColor ?? "black"}
          strokeWidth={c.strokeWidth ?? 1}
        />
      ))}
      {points.map((p: any, i: number) => (
        <circle
          key={`point-${i}`}
          cx={p.x ?? 0}
          cy={p.y ?? 0}
          r={p.radius ?? 1.5}
          fill={p.color ?? "black"}
        />
      ))}
      {texts.map((t: any, i: number) => (
        <text
          key={`text-${i}`}
          x={t.x ?? 0}
          y={t.y ?? 0}
          fontSize={t.fontSize ?? 10}
          fill={t.color ?? "black"}
        >
          {t.text ?? ""}
        </text>
      ))}
    </svg>
  )
}
