import { expect, test } from "bun:test"
import type { GraphicsObject } from "graphics-debug"
import type { ReactElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { SimpleGraphicsSVG } from "../lib/react/SimpleGraphicsSVG"

const render = (graphics: GraphicsObject) =>
  renderToStaticMarkup(<SimpleGraphicsSVG graphics={graphics} />)

test("fallback SVG honors the default Cartesian vertical orientation", () => {
  const graphics: GraphicsObject = {
    lines: [
      {
        points: [
          { x: 0, y: 0 },
          { x: 0, y: 10 },
        ],
      },
    ],
  }

  expect(render(graphics)).toContain('points="0,10 0,0"')
})

test("fallback SVG preserves explicit screen coordinates", () => {
  const graphics: GraphicsObject = {
    coordinateSystem: "screen",
    lines: [
      {
        points: [
          { x: 0, y: 0 },
          { x: 0, y: 10 },
        ],
      },
    ],
  }

  expect(render(graphics)).toContain('points="0,0 0,10"')
})
