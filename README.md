# @tscircuit/solver-utils

Reusable building blocks for iterative solvers, multi-stage solver pipelines, and React-based solver debugging UIs.

`@tscircuit/solver-utils` gives you:

- `BaseSolver`: a safe base class for step-based solvers.
- `BasePipelineSolver`: orchestration for sequential solver stages.
- React debugger components for stepping, animating, and inspecting solver state.

## Table of Contents

- [Install](#install)
- [Quick Start](#quick-start)
- [Core Concepts](#core-concepts)
- [BaseSolver Guide](#basesolver-guide)
- [BasePipelineSolver Guide](#basepipelinesolver-guide)
- [React Debugger Guide](#react-debugger-guide)
- [Testing Solvers](#testing-solvers)
- [API Reference](#api-reference)
- [Development](#development)
- [Troubleshooting](#troubleshooting)

## Install

```bash
bun add @tscircuit/solver-utils
```

You will also need peer dependencies:

```bash
bun add graphics-debug
bun add -d typescript
```

For React debugger usage:

```bash
bun add react react-dom
```

## Quick Start

### 1) Create a simple solver

```ts
import { BaseSolver } from "@tscircuit/solver-utils"
import type { GraphicsObject } from "graphics-debug"

class CountToTenSolver extends BaseSolver {
  target = 10
  value = 0

  override _step() {
    this.value += 1
    this.stats = { value: this.value, target: this.target }

    if (this.value >= this.target) {
      this.solved = true
    }
  }

  override getConstructorParams() {
    return []
  }

  override getOutput() {
    return { finalValue: this.value }
  }

  override visualize(): GraphicsObject {
    return {
      points: [{ x: this.value, y: 0, color: "blue" }],
      lines: [],
      rects: [],
      circles: [],
      texts: [{ x: 0, y: 1, text: `value=${this.value}` }],
    }
  }
}

const solver = new CountToTenSolver()
solver.solve()

console.log({
  solved: solver.solved,
  iterations: solver.iterations,
  output: solver.getOutput(),
  timeMs: solver.timeToSolve,
})
```

### 2) Use a pipeline solver

```ts
import {
  BasePipelineSolver,
  definePipelineStep,
} from "@tscircuit/solver-utils"
import { BaseSolver } from "@tscircuit/solver-utils"

type Input = { initial: number; target: number }

class AddOneSolver extends BaseSolver {
  value: number
  target: number

  constructor(params: { start: number; target: number }) {
    super()
    this.value = params.start
    this.target = params.target
  }

  override _step() {
    this.value += 1
    if (this.value >= this.target) this.solved = true
  }

  override getOutput() {
    return { value: this.value }
  }

  override getConstructorParams() {
    return [{ start: this.value, target: this.target }]
  }
}

class DoubleSolver extends BaseSolver {
  value: number

  constructor(params: { start: number; min: number }) {
    super()
    this.value = params.start
  }

  override _step() {
    this.value *= 2
    if (this.value >= 100) this.solved = true
  }

  override getOutput() {
    return { value: this.value }
  }

  override getConstructorParams() {
    return [{ start: this.value, min: 100 }]
  }
}

class ExamplePipeline extends BasePipelineSolver<Input> {
  addOneSolver?: AddOneSolver
  doubleSolver?: DoubleSolver

  pipelineDef = [
    definePipelineStep("addOneSolver", AddOneSolver, (instance) => [
      { start: instance.inputProblem.initial, target: instance.inputProblem.target },
    ]),
    definePipelineStep("doubleSolver", DoubleSolver, (instance) => [
      {
        start: instance.getSolver<AddOneSolver>("addOneSolver")!.value,
        min: 100,
      },
    ]),
  ]

  override getConstructorParams() {
    return [this.inputProblem]
  }
}

const pipeline = new ExamplePipeline({ initial: 0, target: 10 })
pipeline.solve()

console.log(pipeline.getAllOutputs())
console.log(pipeline.getStageStats())
```

### 3) Debug in React

```tsx
import { useMemo } from "react"
import { GenericSolverDebugger } from "@tscircuit/solver-utils/react"

export default function SolverPage() {
  const solver = useMemo(() => new CountToTenSolver(), [])

  return (
    <GenericSolverDebugger
      solver={solver}
      animationSpeed={25}
      onSolverStarted={(s) => console.log("started", s.getSolverName())}
      onSolverCompleted={(s) => console.log("done", s.stats)}
    />
  )
}
```

## Core Concepts

- `step()`: perform one unit of work.
- `solve()`: repeatedly call `step()` until solved or failed.
- `stats`: free-form live diagnostics shown in debugger tables.
- `visualize()`: return a `GraphicsObject` for rendering.
- `getConstructorParams()`: return reproducible constructor input (used by download helpers).
- `getOutput()`: standardized solved result (especially useful in pipelines).

## BaseSolver Guide

### Lifecycle

1. `setup()` runs once before first step (via `_setup()`).
2. Each `step()` calls your `_step()`.
3. Solver ends when you set `solved = true` or `failed = true`.
4. If max iterations are reached, solver auto-fails with an error.

### Important fields

- `MAX_ITERATIONS` (default `100_000`)
- `iterations`
- `progress` (auto-updated if you implement `computeProgress()`)
- `timeToSolve`
- `error`
- `activeSubSolver` (for nested solver composition)
- `stats` (arbitrary debugging info)

### Recommended implementation pattern

```ts
class MySolver extends BaseSolver {
  constructor(private input: InputType) {
    super()
    this.MAX_ITERATIONS = 20_000
  }

  override _setup() {
    // optional one-time initialization
  }

  override _step() {
    // mutate state toward solution
    // set this.solved = true when complete
    // set this.failed = true and this.error when unrecoverable
    this.stats = { ...this.stats, someMetric: 123 }
  }

  computeProgress() {
    return 0.0 // number between 0 and 1
  }

  override visualize() {
    return { points: [], lines: [], rects: [], circles: [], texts: [] }
  }

  override getConstructorParams() {
    return [this.input]
  }

  override getOutput() {
    return { /* final result */ }
  }
}
```

### Error handling behavior

- Exceptions thrown in `_step()` are captured, `failed` is set, and the error is re-thrown.
- On max-iteration exhaustion, `tryFinalAcceptance()` is called before failing.
- You can override `tryFinalAcceptance()` for “best effort” acceptance logic.

## BasePipelineSolver Guide

`BasePipelineSolver<TInput>` is a `BaseSolver` that runs multiple solver stages in sequence.

### Defining stages with `definePipelineStep`

```ts
definePipelineStep(
  "stageName",
  StageSolverClass,
  (pipeline) => [constructorParamObject],
  {
    onSolved: (pipeline) => {
      // optional callback after this stage solves
    },
  },
)
```

### Pipeline capabilities

- Auto-instantiates each stage solver when needed.
- Tracks per-stage timing and iteration metadata.
- Captures stage outputs automatically from `getOutput()`.
- Supports nested pipelines (a stage can itself be `BasePipelineSolver`).
- Merges per-stage visualizations into a combined `GraphicsObject`.

### Useful methods

- `solveUntilStage(stageName)`
- `getCurrentStageName()`
- `getStageProgress()`
- `getStageStats()`
- `getStageOutput<T>(stageName)`
- `getAllOutputs()`
- `hasStageOutput(stageName)`
- `getSolver<T>(stageName)`

### Initial and final visuals

You can override:

- `initialVisualize()` for pre-stage context,
- `finalVisualize()` for final summary output.

These are inserted as extra visualization steps around stage visuals.

## React Debugger Guide

Import from:

```ts
import { GenericSolverDebugger } from "@tscircuit/solver-utils/react"
```

### `GenericSolverDebugger` props

- `solver?: BaseSolver`
- `createSolver?: () => BaseSolver` (use this when you need lazy creation)
- `animationSpeed?: number` (ms interval, default `25`)
- `onSolverStarted?: (solver) => void`
- `onSolverCompleted?: (solver) => void`

### What the debugger UI provides

- Step once, solve fully, animate, or step until target iteration.
- Renderer toggle (`vector` or `canvas`) with localStorage persistence.
- Download current visualization JSON.
- Live iteration count, elapsed solve time, and solved/failed badges.
- Pipeline stage table (for pipeline solvers), including nested pipelines.
- Breadcrumb chain with per-solver download menus.

### Download features

From the debugger dropdowns, you can download:

- constructor params JSON,
- generated `*.page.tsx` demo scaffold,
- generated `*.test.ts` scaffold.

Downloaded JSON automatically strips keys beginning with `_`.

## Testing Solvers

Use Bun tests:

```ts
import { test, expect } from "bun:test"

test("solver reaches solved state", () => {
  const solver = new CountToTenSolver()
  solver.solve()
  expect(solver.solved).toBe(true)
  expect(solver.failed).toBe(false)
  expect(solver.iterations).toBeGreaterThan(0)
})
```

Run tests:

```bash
bun test
```

## API Reference

### Package exports

- Root: `@tscircuit/solver-utils`
  - `BaseSolver`
  - `BasePipelineSolver`
  - `definePipelineStep`
- React: `@tscircuit/solver-utils/react`
  - `GenericSolverDebugger`
  - `GenericSolverToolbar`
  - `PipelineStagesTable`
  - `SolverBreadcrumbInputDownloader`
  - `DownloadDropdown`

### `BaseSolver` default state

- `solved = false`
- `failed = false`
- `iterations = 0`
- `progress = 0`
- `error = null`
- `stats = {}`
- `MAX_ITERATIONS = 100_000`

### `BasePipelineSolver` notable state

- `currentPipelineStageIndex`
- `pipelineOutputs`
- `startTimeOfStage`
- `endTimeOfStage`
- `timeSpentOnStage`
- `firstIterationOfStage`

## Development

Clone and install:

```bash
bun install
```

Run interactive demo site (React Cosmos):

```bash
bun run start
```

Run tests:

```bash
bun test
```

Build package:

```bash
bun run build
```

Export demo site:

```bash
bun run build:site
```

Format:

```bash
bun run format
```

## Troubleshooting

- If `progress` stays at `0`, implement `computeProgress()` in your solver.
- If input download fails, ensure `getConstructorParams()` is implemented.
- If solver never terminates, confirm `_step()` eventually sets `solved` or `failed`.
- If pipeline stage lookup fails, confirm `solverName` matches property access in `getSolver("name")`.
- If React debugger renders nothing, make sure `visualize()` returns at least one non-empty primitive array.
