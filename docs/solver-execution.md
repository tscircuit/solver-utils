# Solver execution

Callers construct solver classes as usual. Execution is supplied by a runtime:

```ts
import { NodeSolverRuntime } from "@tscircuit/solver-utils"

const solver = new MySolver(problem)
await solver.solveAsync() // Single-threaded by default, including in Node.

const runtime = new NodeSolverRuntime({ threads: 4 })
try {
  const parallelSolver = new MySolver(problem, { runtime })
  await parallelSolver.solveAsync()
  const output = parallelSolver.getOutput()

  // Reuse the same runtime and its workers for other solver instances.
  const anotherSolver = new MySolver(anotherProblem)
  anotherSolver.setRuntime(runtime)
  await anotherSolver.solveAsync()
} finally {
  await runtime.dispose()
}
```

There is no public solver factory. `.solve()` remains synchronous.
`.solveAsync()` resolves to `void` and updates the same instance: `solved`,
`failed`, `error`, `iterations`, `progress`, and `getOutput()` retain their roles.
Existing constructors and `_step()` implementations continue to work unchanged.

`BaseSolver` accepts optional `SolverOptions` containing `{ runtime }`.
Concrete solvers may forward those options through an existing options object
or an optional constructor argument. `BasePipelineSolver(input, options?)`
forwards them automatically. `.setRuntime(runtime)` also supports solvers whose
constructors do not forward options. It returns the solver for chaining and
rejects changes while asynchronous solving is active.

## Runtime configuration and ownership

`SolverRuntime` is an interface exposing typed task execution and disposal.
Applications can provide their own implementation. The supplied classes are:

- `SingleThreadSolverRuntime`: portable inline execution, with no workers.
- `NodeSolverRuntime({ threads, startupTimeoutMs? })`: native worker pools when
  running in a Node-compatible host, including Bun. `threads` defaults to 2 and
  bounds each task module's pool; `threads: 1` runs inline. Browsers always run
  inline, and native built-ins load only after runtime detection.

Every solver captures `SolverRuntime.defaultRuntime` when constructed unless
an explicit runtime is supplied. The initial default is a
`SingleThreadSolverRuntime`. Applications can configure a shared default:

```ts
import { NodeSolverRuntime, SolverRuntime } from "@tscircuit/solver-utils"

const previous = SolverRuntime.defaultRuntime
const runtime = new NodeSolverRuntime({ threads: 4 })
SolverRuntime.defaultRuntime = runtime
try {
  await new MySolver(problem).solveAsync()
} finally {
  SolverRuntime.defaultRuntime = previous
  await runtime.dispose()
}
```

Changing the global default affects new solvers. Existing solvers keep their
runtime until `.setRuntime()` is called. A pipeline lends its runtime to child
steps, so children use the same task executors regardless of constructor shape.

The runtime owner manages lifetime. Finishing or failing a solver does not
dispose the runtime, because other solvers may share it. `runtime.dispose()`
immediately stops accepting tasks, drains accepted work, and stops all owned
workers. Repeated disposal returns the same promise. Dispose only after all
solvers using that runtime have finished; a task that never finishes prevents
graceful disposal. Borrowed task executors must not be disposed by solvers.

## Solver lifecycle

`BaseSolver.solveAsync()` performs the usual setup, logical iterations,
progress updates, final acceptance, and iteration-limit handling. By default,
it calls the existing `step()` method. A solver may override the protected
`_stepAsync()` hook to perform asynchronous work for one logical step.

The base solver delegates task execution to its runtime. It has no thread-count
logic, worker creation, Node API calls, or runtime disposal responsibilities.
Existing solvers with no asynchronous implementation run their usual steps
without creating workers, even when assigned a Node runtime.

Pipelines advance child solvers through that hook while preserving stage
transitions, callbacks, outputs, and logical iteration counts. A custom pipeline
`_step()` override retains its synchronous behavior until explicitly adapted.
Custom coordinators can use the protected `_stepChildAsync(child)` helper to
advance children with the parent's runtime. Concurrent `.solveAsync()` calls
on one solver return the same promise.

## Implementing parallel work inside a solver

Task catalogs and handlers belong to the solver implementation. They are not
part of its caller's setup. Keep handlers in a module that both the solver and
its Node worker entrypoint can import:

```ts
// tasks.ts
import type {
  SolverTaskDefinition,
  SolverTaskHandlers,
} from "@tscircuit/solver-utils"

export type Tasks = {
  square: SolverTaskDefinition<number, number>
}

export const square = (value: number) => value * value
export const handlers: SolverTaskHandlers<Tasks> = { square }
```

```ts
// worker.ts: ship this module as worker.js for a plain Node host.
import { runSolverWorker } from "@tscircuit/solver-utils"
import { handlers } from "./tasks.js"

await runSolverWorker(handlers)
```

```ts
// SquaresSolver.ts
import {
  BaseSolver,
  type SolverOptions,
  type SolverTaskModule,
} from "@tscircuit/solver-utils"
import { handlers, square, type Tasks } from "./tasks.js"

const taskModule: SolverTaskModule<Tasks> = {
  handlers,
  workerUrl: new URL("./worker.js", import.meta.url),
}

export class SquaresSolver extends BaseSolver {
  output: number[] = []

  constructor(private values: number[], options?: SolverOptions) {
    super(options)
  }

  override _step() {
    this.output = this.values.map(square)
    this.solved = true
  }

  protected override async _stepAsync() {
    const executor = await this._getTaskExecutor(taskModule)
    const results = await Promise.allSettled(
      this.values.map((value) =>
        executor.execute("square", value, { shared: undefined }),
      ),
    )
    // Commit results, or select the first task error, in logical input order.
    this.output = results.map((result) => {
      if (result.status === "rejected") throw result.reason
      return result.value
    })
    this.solved = true
  }

  override getOutput() {
    return this.output
  }
}
```

`_getTaskExecutor()` delegates to `this.runtime.getExecutor()` without creating
or managing workers. Keep the task module object stable so related steps and
solver instances reuse its executor. Its lifetime belongs to the runtime. Worker modules register
handlers with `runSolverWorker()`; the worker module must be loadable by the
host runtime. Browser execution uses the same handlers without loading that
module. No browser worker adapter is included.

The underlying `SolverExecutor` interface remains available for infrastructure
and typed solver integration. Runtimes obtain executors internally; callers
construct solvers and supply a runtime rather than using executor factories.
A task's input, output, and shared-context types are specified by
`SolverTaskDefinition<Input, Output, Shared>`. Use namespaced task kinds when
combining catalogs and `{ shared: undefined }` when no shared context is needed.

## Data isolation and shared memory

Inputs, outputs, and shared context must be structured-cloneable data. Register
handlers by kind; do not send callbacks or solver instances to workers. Ordinary
task input and context are snapshotted synchronously at submission, even when
queued, and ordinary outputs are isolated. Native message transport preserves
shared backing storage in both inline and worker execution.

`createSharedSolverBuffer(view)` copies exactly a view's visible bytes into a
fixed-size `SharedArrayBuffer`, including subarray and DataView offsets. Publish
shared topology before submitting tasks and keep it immutable until all
consuming tasks settle. TypeScript `readonly` and `Object.freeze()` do not
prevent writes to shared bytes. Keep occupancy, heaps, random generators, and
mutable search state private to each task. Shared output requires exclusive
ranges and completion before the coordinator reads it.

`SolverSharedMemory` is an optional named-buffer shape. Task-specific shared
context may also contain ordinary schema metadata and typed views. Ordinary
metadata is copied per task. Tasks using only ordinary cloneable data also work
in browsers where shared memory is unavailable. Shared buffers never belong in
transfer lists; there is no transfer-list API that detaches ordinary inputs.

Handler exceptions and clone failures reject their request without poisoning
the pool. Errors preserve `name`, `message`, and optional `stack`; subclasses,
custom fields, and causes are not transported. Worker crashes, unexpected exits,
invalid replies, or protocol mismatches fail the pool without retrying work.
Workers stop before pending requests expose infrastructure failure. A readiness
deadline is infrastructure protection, not a task computation budget.

## Deterministic adoption

This infrastructure does not automatically parallelize existing algorithms.
Hypergraph, high-density, and repair solvers must adopt independent tasks
incrementally and prove exact output parity against their synchronous paths.

Tasks may finish in any order. Commit results and select algorithmic errors in
original logical order, preserving first-success rules, floating-point reduction
order, tie behavior, cache visibility, seeds, and iteration budgets. Promise
rejection arrival order must not select a routing result. Waiting is not solver
work, and worker count or identity must not affect algorithm choices.

Preserve logical solver steps when batching work and test warm caches and budget
boundaries. Keep runtime resources out of constructor reproduction data,
algorithm cache keys, and diagnostic JSON. Thread settings affect execution;
they are not algorithm inputs.
