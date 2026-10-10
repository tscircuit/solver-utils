import { expect, mock, test } from "bun:test"
import { JSDOM } from "jsdom"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { BaseSolver } from "../lib/BaseSolver"
import { GenericSolverDebugger } from "../lib/react/GenericSolverDebugger"

class ExampleSolver extends BaseSolver {
  override _step() {
    if (this.iterations >= 3) this.solved = true
  }
}

test("debuggers share local styles, preserve controls and leave their host untouched", async () => {
  const dom = new JSDOM(
    '<button id="outside-button" class="px-3 border">Outside</button><h3 id="outside-heading">Heading</h3><div id="outside-hidden" class="hidden">Visible</div><div id="root"></div>',
    { url: "http://localhost", pretendToBeVisual: true },
  )
  const globals = [
    "window",
    "document",
    "Node",
    "Element",
    "HTMLElement",
    "MouseEvent",
    "getComputedStyle",
    "IS_REACT_ACT_ENVIRONMENT",
    "fetch",
  ] as const
  const previous = Object.fromEntries(
    globals.map((key) => [key, (globalThis as Record<string, unknown>)[key]]),
  )
  const network = mock(() => {
    throw new Error("No requests are allowed")
  })
  Object.assign(globalThis, {
    ...Object.fromEntries(
      globals.map((key) => [
        key,
        (dom.window as unknown as Record<string, unknown>)[key],
      ]),
    ),
    IS_REACT_ACT_ENVIRONMENT: true,
    fetch: network,
  })
  const outside = () =>
    ["outside-button", "outside-heading", "outside-hidden"].map((id) => {
      const style = getComputedStyle(document.getElementById(id)!)
      return [
        style.display,
        style.padding,
        style.margin,
        style.borderStyle,
        style.fontSize,
        style.boxSizing,
      ]
    })
  const hostStyles = outside()
  const first = new ExampleSolver()
  first.stats = { score: 42, attempts: 3 }
  const second = new ExampleSolver()
  let root = createRoot(document.getElementById("root")!)
  try {
    await act(async () =>
      root.render(
        <>
          <GenericSolverDebugger solver={first} />
          <GenericSolverDebugger solver={second} />
        </>,
      ),
    )
    expect(
      document.querySelectorAll(
        'style[data-styles="tscircuit-solver-debugger"]',
      ),
    ).toHaveLength(1)
    expect(document.querySelectorAll("script[src]")).toHaveLength(0)
    expect(network).not.toHaveBeenCalled()
    expect(outside()).toEqual(hostStyles)
    const debuggerElement = document.querySelector(
      ".tscircuit-solver-debugger",
    )!
    const button = (text: string) =>
      Array.from(debuggerElement.querySelectorAll("button")).find(
        (element) => element.textContent === text,
      )!
    expect(getComputedStyle(button("Step")).paddingLeft).toBe("0.75rem")
    expect(getComputedStyle(button("Step")).boxSizing).toBe("border-box")
    await act(async () => button("Step").click())
    expect(first.iterations).toBe(1)
    await act(async () => button("Solve").click())
    expect(first.solved).toBe(true)
    expect(button("Step").disabled).toBe(true)
    await act(async () => button("Stats").click())
    expect(
      debuggerElement.querySelectorAll('input[type="checkbox"]'),
    ).toHaveLength(2)
    await act(async () => root.unmount())
    root = createRoot(document.getElementById("root")!)
    await act(async () =>
      root.render(<GenericSolverDebugger solver={new ExampleSolver()} />),
    )
    expect(
      document.querySelectorAll(
        'style[data-styles="tscircuit-solver-debugger"]',
      ),
    ).toHaveLength(1)
    expect(document.querySelectorAll("script[src]")).toHaveLength(0)
    expect(outside()).toEqual(hostStyles)
  } finally {
    await act(async () => root.unmount())
    Object.assign(globalThis, previous)
    dom.window.close()
  }
})
