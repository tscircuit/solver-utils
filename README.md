# @tscircuit/solver-utils

Reusable building blocks for iterative solvers, multi-stage solver pipelines, and React-based solver debugging UIs.

`@tscircuit/solver-utils` gives you:

- `BaseSolver`: a safe base class for step-based solvers.
- `BasePipelineSolver`: orchestration for sequential solver stages.
- `SolverWorkerClient` + `exposeSolverWorker`: a standard way to run a solver inside a Web Worker.
- React debugger components for stepping, animating, and inspecting solver state.

## Table of Contents

- [Install](#install)
- [Quick Start](#quick-start)
- [Core Concepts](#core-concepts)
- [BaseSolver Guide](#basesolver-guide)
- [BasePipelineSolver Guide](#basepipelinesolver-guide)
- [Solver Worker Guide](#solver-worker-guide)
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

### 3) Run a solver in a Web Worker

`SolverWorkerClient` is the async mirror of `BaseSolver` for worker-backed solvers.

```ts
// CountToTenSolver.worker.ts
import { exposeSolverWorker } from "@tscircuit/solver-utils"
import { CountToTenSolver } from "./CountToTenSolver"

exposeSolverWorker(CountToTenSolver)
```

```ts
// main-thread.ts
import { SolverWorkerClient } from "@tscircuit/solver-utils"

const worker = new Worker(
  new URL("./CountToTenSolver.worker.ts", import.meta.url),
  { type: "module" },
)

const solver = await SolverWorkerClient.create(worker)
await solver.solve()

console.log({
  solved: solver.solved,
  snapshot: solver.snapshot,
})
```

### 4) Debug in React

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
- `getSerializableSnapshot()`: standardized structured-clone-safe state for worker transport.

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
- Override `getSerializableState()` if the default public-field snapshot is too large or contains values that should not cross a worker boundary.

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

## Solver Worker Guide

The worker convention is:

1. A dedicated worker owns exactly one solver instance.
2. The worker entry calls `exposeSolverWorker(...)`.
3. The main thread talks to that worker through `SolverWorkerClient`.
4. State crosses the worker boundary as a `getSerializableSnapshot()` payload, not as a live class instance.

`SolverWorkerClient` intentionally does **not** extend `BaseSolver`. The local object is a proxy over message passing, so the common lifecycle methods become async:

- `init(...args)`
- `step()`
- `solve({ snapshotEvery? })`
- `syncSnapshot()`
- `getOutput()`
- `getConstructorParams()`
- `visualize()`
- `preview()`
- `call(methodName, ...args)`
- `dispose()`

### Canonical worker packaging

Put a dedicated entrypoint next to the solver and keep it very small:

```ts
// MySolver.worker.ts
import { exposeSolverWorker } from "@tscircuit/solver-utils"
import { MySolver } from "./MySolver"

exposeSolverWorker(MySolver)
```

On the main thread:

```ts
import { SolverWorkerClient } from "@tscircuit/solver-utils"

const worker = new Worker(new URL("./MySolver.worker.ts", import.meta.url), {
  type: "module",
})

const solver = await SolverWorkerClient.create(worker, {
  input: "whatever your solver constructor expects",
})

await solver.solve()
const output = await solver.getOutput()
```

If the worker needs custom construction logic, use the object form:

```ts
import { exposeSolverWorker } from "@tscircuit/solver-utils"
import { MySolver } from "./MySolver"

exposeSolverWorker({
  createSolver: (input, options) => new MySolver({ input, seed: options.seed }),
})
```

### Snapshot contract

`BaseSolver#getSerializableSnapshot()` is the common wire format used by the worker helpers. It includes:

- base solver metadata (`solved`, `failed`, `iterations`, `progress`, `error`, `timeToSolve`)
- `stats`
- `activeSubSolver`
- `failedSubSolvers`
- `state`, which defaults to all enumerable public fields except the base runtime fields

This means most existing solvers can cross the worker boundary without any extra work. If a solver has very large state, circular references you want to trim, or non-cloneable values, override `getSerializableState()`.

### Progress streaming

`await solver.solve({ snapshotEvery: 100 })` makes the worker emit snapshots every 100 iterations. Subscribe on the client when you want coarse-grained live updates without stepping manually:

```ts
const unsubscribe = solver.subscribe((snapshot) => {
  console.log(snapshot.iterations, snapshot.progress)
})

await solver.solve({ snapshotEvery: 100 })
unsubscribe()
```

### Custom solver methods

The worker convention standardizes the common `BaseSolver` surface, but solvers often have domain-specific helpers like `getFinalPosition()`. Use `call(...)` for that:

```ts
const finalPosition = await solver.call("getFinalPosition")
```

Prefer `getOutput()` for stable result contracts, and keep `call(...)` for explicit solver-specific escape hatches.

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
  - `SolverWorkerClient`
  - `exposeSolverWorker`
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

### `BaseSolver` worker snapshot helpers

- `getSerializableState()`
- `getSerializableSnapshot()`

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
- If worker snapshots fail to cross the thread boundary, override `getSerializableState()` to remove non-cloneable values.
- If React debugger renders nothing, make sure `visualize()` returns at least one non-empty primitive array.
