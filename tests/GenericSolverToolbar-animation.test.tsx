import {
  afterAll,
  afterEach,
  beforeAll,
  expect,
  mock,
  spyOn,
  test,
} from "bun:test"
import { Window } from "happy-dom"
import React, { act, StrictMode, useReducer, useState } from "react"
import type { Root } from "react-dom/client"
import { BaseSolver } from "../lib/BaseSolver"
import { GenericSolverToolbar } from "../lib/react/GenericSolverToolbar"

const browser = new Window({ url: "http://localhost" })
const globals = {
  window: browser,
  document: browser.document,
  IS_REACT_ACT_ENVIRONMENT: true,
}
const originalGlobals = Object.keys(globals).map(
  (name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const,
)
const nativeSetInterval = globalThis.setInterval
const nativeClearInterval = globalThis.clearInterval
const intervals = new Map<ReturnType<typeof setInterval>, () => void>()
let createRoot: typeof import("react-dom/client").createRoot
let root: Root | undefined
let container: HTMLDivElement

beforeAll(async () => {
  for (const [name, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, name, { configurable: true, value })
  }
  Object.defineProperty(window, "prompt", {
    configurable: true,
    writable: true,
    value: () => null,
  })
  ;({ createRoot } = await import("react-dom/client"))
})

afterEach(async () => {
  await act(() => root?.unmount())
  root = undefined
  container?.remove()
  for (const timer of intervals.keys()) nativeClearInterval(timer)
  intervals.clear()
  globalThis.setInterval = nativeSetInterval
  globalThis.clearInterval = nativeClearInterval
  mock.restore()
})

afterAll(async () => {
  await browser.happyDOM.close()
  for (const [name, descriptor] of originalGlobals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor)
    else Reflect.deleteProperty(globalThis, name)
  }
})

class CountingSolver extends BaseSolver {
  constructor(
    private readonly finishAfter = 3,
    private readonly fail = false,
  ) {
    super()
  }

  override _step() {
    if (this.iterations === this.finishAfter) {
      if (this.fail) this.failed = true
      else this.solved = true
    }
  }

  override getConstructorParams() {
    return []
  }

  override getOutput() {
    return "lint result"
  }
}

async function mountToolbar(solver: BaseSolver, animationSpeed = 100) {
  // Control only the interval clock. React renders, effects and cleanup are real.
  Object.defineProperty(globalThis, "setInterval", {
    configurable: true,
    writable: true,
    value: (callback: () => void) => {
      const timer = nativeSetInterval(() => {}, 2 ** 31 - 1)
      timer.unref()
      intervals.set(timer, callback)
      return timer
    },
  })
  Object.defineProperty(globalThis, "clearInterval", {
    configurable: true,
    writable: true,
    value: (timer: ReturnType<typeof setInterval>) => {
      intervals.delete(timer)
      nativeClearInterval(timer)
    },
  })
  const completed = mock((finished: BaseSolver) => {})
  const started = mock((current: BaseSolver) => {})

  function Consumer() {
    const [, triggerRender] = useReducer((count: number) => count + 1, 0)
    const [output, setOutput] = useState("")
    return (
      <>
        <GenericSolverToolbar
          solver={solver}
          triggerRender={triggerRender}
          animationSpeed={animationSpeed}
          renderer="vector"
          onRendererChange={() => {}}
          onAnimationSpeedChange={() => {}}
          onDownloadVisualization={() => {}}
          onSolverStarted={started}
          onSolverCompleted={(finished) => {
            completed(finished)
            setOutput(finished.getOutput())
          }}
        />
        <output>{output}</output>
      </>
    )
  }

  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
  await act(() =>
    root?.render(
      <StrictMode>
        <Consumer />
      </StrictMode>,
    ),
  )
  return { completed, started }
}

async function click(label: string) {
  const button = Array.from(container.querySelectorAll("button")).find(
    (candidate) => candidate.textContent === label,
  )
  if (!button) throw new Error(`Missing button: ${label}`)
  await act(() => button.click())
}

async function tick() {
  await act(() => {
    for (const callback of [...intervals.values()]) callback()
  })
}

test("Animate delivers the result in the finishing tick exactly once under StrictMode", async () => {
  const solver = new CountingSolver()
  const { completed } = await mountToolbar(solver)
  await click("Animate")
  await tick()
  await tick()
  expect(solver.iterations).toBe(2)
  expect(completed).not.toHaveBeenCalled()
  await tick()
  expect(solver.solved).toBe(true)
  expect(completed).toHaveBeenCalledTimes(1)
  expect(completed).toHaveBeenCalledWith(solver)
  expect(container.querySelector("output")?.textContent).toBe("lint result")
  expect(intervals.size).toBe(0)
  await tick()
  expect(completed).toHaveBeenCalledTimes(1)
})

test("accelerated Animate stops partway through its batch and completes once", async () => {
  const solver = new CountingSolver(7)
  const { completed } = await mountToolbar(solver, 0.1)
  await click("Animate")
  await tick()
  expect(solver.iterations).toBe(7)
  expect(completed).toHaveBeenCalledTimes(1)
  expect(completed).toHaveBeenCalledWith(solver)
  expect(intervals.size).toBe(0)
})

test("Stop pauses without completing, and resuming can finish", async () => {
  const solver = new CountingSolver()
  const { completed } = await mountToolbar(solver)
  await click("Animate")
  await tick()
  await click("Stop")
  expect(intervals.size).toBe(0)
  await tick()
  expect(solver.iterations).toBe(1)
  expect(completed).not.toHaveBeenCalled()
  await click("Animate")
  await tick()
  await tick()
  expect(completed).toHaveBeenCalledTimes(1)
  expect(completed).toHaveBeenCalledWith(solver)
})

test("unmount cancels Animate without delivering an unfinished result", async () => {
  const solver = new CountingSolver()
  const { completed } = await mountToolbar(solver)
  await click("Animate")
  await tick()
  await act(() => root?.unmount())
  root = undefined
  expect(intervals.size).toBe(0)
  await tick()
  expect(solver.iterations).toBe(1)
  expect(completed).not.toHaveBeenCalled()
})

test("failed Animate stops without delivering a successful result", async () => {
  const solver = new CountingSolver(1, true)
  const { completed } = await mountToolbar(solver, 0.1)
  await click("Animate")
  await tick()
  expect(solver.failed).toBe(true)
  expect(solver.iterations).toBe(1)
  expect(intervals.size).toBe(0)
  expect(completed).not.toHaveBeenCalled()
})

test("Solve still starts and delivers its result once", async () => {
  const solver = new CountingSolver()
  const { completed, started } = await mountToolbar(solver)
  await click("Solve")
  expect(started).toHaveBeenCalledTimes(1)
  expect(started).toHaveBeenCalledWith(solver)
  expect(completed).toHaveBeenCalledTimes(1)
  expect(completed).toHaveBeenCalledWith(solver)
  expect(container.querySelector("output")?.textContent).toBe("lint result")
})

test("Step Until Iteration only completes when it reaches the solved iteration", async () => {
  const solver = new CountingSolver()
  const { completed } = await mountToolbar(solver)
  const prompt = spyOn(window, "prompt").mockReturnValue("2")
  await click("Step Until Iteration")
  expect(solver.iterations).toBe(2)
  expect(completed).not.toHaveBeenCalled()
  prompt.mockReturnValue("3")
  await click("Step Until Iteration")
  expect(completed).toHaveBeenCalledTimes(1)
  expect(completed).toHaveBeenCalledWith(solver)
})

test("manual Step retains its existing callback behavior", async () => {
  const solver = new CountingSolver(1)
  const { completed } = await mountToolbar(solver)
  await click("Step")
  expect(solver.solved).toBe(true)
  expect(completed).not.toHaveBeenCalled()
})
