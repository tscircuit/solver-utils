import { afterAll, beforeAll, expect, test } from "bun:test"
import type { GraphicsObject } from "graphics-debug"
import type { ReactElement } from "react"
import { BaseSolver } from "../lib/BaseSolver"
import { GenericSolverDebugger } from "../lib/react/GenericSolverDebugger"

const {
  renderToStaticMarkup,
}: {
  renderToStaticMarkup: (element: ReactElement) => string
} = require("react-dom/server")

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window")
beforeAll(() => {
  // The interactive renderer reads browser settings during its initial render.
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: { pathname: "/", search: "" },
      localStorage: { getItem: () => null },
      addEventListener: () => {},
      removeEventListener: () => {},
      ResizeObserver: class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    },
  })
})
afterAll(() => {
  if (originalWindow)
    Object.defineProperty(globalThis, "window", originalWindow)
  else Reflect.deleteProperty(globalThis, "window")
})

class VisualSolver extends BaseSolver {
  constructor(private graphics: GraphicsObject) {
    super()
  }

  override visualize() {
    return this.graphics
  }
}

test("the debugger displays graphics containing only text", () => {
  const solver = new VisualSolver({
    texts: [{ x: 0, y: 0, text: "Route complete" }],
  })
  const html = renderToStaticMarkup(<GenericSolverDebugger solver={solver} />)

  expect(html).not.toContain("No Graphics Yet")
  expect(html).toContain("Route complete")
})

test("the debugger still shows its placeholder for empty graphics", () => {
  const solver = new VisualSolver({
    points: [],
    lines: [],
    rects: [],
    circles: [],
    texts: [],
  })
  const html = renderToStaticMarkup(<GenericSolverDebugger solver={solver} />)

  expect(html).toContain("No Graphics Yet")
})

test("the debugger displays graphics containing only arrows", () => {
  const solver = new VisualSolver({
    arrows: [{ start: { x: 0, y: 0 }, end: { x: 10, y: 5 } }],
  })
  const html = renderToStaticMarkup(<GenericSolverDebugger solver={solver} />)

  expect(html).not.toContain("No Graphics Yet")
  expect(html).toContain("<svg")
})
