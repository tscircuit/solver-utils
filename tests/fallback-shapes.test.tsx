import { expect, test } from "bun:test"
import type { GraphicsObject } from "graphics-debug"
import type { ReactElement } from "react"
import { SimpleGraphicsSVG } from "../lib/react/SimpleGraphicsSVG"

const {
  renderToStaticMarkup,
}: {
  renderToStaticMarkup: (element: ReactElement) => string
} = require("react-dom/server")

const render = (graphics: GraphicsObject) =>
  renderToStaticMarkup(<SimpleGraphicsSVG graphics={graphics} />)

test("fallback rectangles use their center and include their actual bounds", () => {
  const svg = render({
    rects: [{ center: { x: 100, y: -50 }, width: 20, height: 10 }],
  })

  expect(svg).toContain('x="90" y="-55" width="20" height="10"')
  expect(svg).toContain('viewBox="80 -65 40 30"')
})

test("fallback circles use their center and include their actual bounds", () => {
  const svg = render({
    circles: [{ center: { x: -40, y: 70 }, radius: 5 }],
  })

  expect(svg).toContain('cx="-40" cy="70" r="5"')
  expect(svg).toContain('viewBox="-55 55 30 30"')
})

test("the viewBox includes separated rectangles and circles", () => {
  const svg = render({
    rects: [{ center: { x: 100, y: -50 }, width: 20, height: 10 }],
    circles: [{ center: { x: -40, y: 70 }, radius: 5 }],
  })

  expect(svg).toContain('viewBox="-55 -65 175 150"')
})

test("fallback shapes use the fill and stroke fields from GraphicsObject", () => {
  const svg = render({
    rects: [
      {
        center: { x: 0, y: 0 },
        width: 20,
        height: 10,
        fill: "red",
        stroke: "blue",
      },
    ],
    circles: [
      { center: { x: 40, y: 0 }, radius: 5, fill: "green", stroke: "purple" },
    ],
  })

  expect(svg).toContain('fill="red" stroke="blue"')
  expect(svg).toContain('fill="green" stroke="purple"')
})

test("rectangles centered at the origin extend to both sides of it", () => {
  const svg = render({
    rects: [{ center: { x: 0, y: 0 }, width: 20, height: 10 }],
  })

  expect(svg).toContain('x="-10" y="-5"')
  expect(svg).toContain('viewBox="-20 -15 40 30"')
})
