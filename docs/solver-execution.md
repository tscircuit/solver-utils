# Shared solver execution contract

`SolverExecutor` is a structural contract for executing typed solver tasks.
Hypergraph, high-density, repair, and other solvers can depend on
`@tscircuit/solver-utils` without importing a parent autorouter package.

The host owns execution resources. Solvers own their algorithms and the order
in which results affect them. The Node adapters execute explicitly registered
tasks without changing `BaseSolver` / `BasePipelineSolver` or dispatching any
existing autorouter stages automatically.

## Typed task catalogs

Each solver defines a catalog with input, result, and shared-context types:

```ts
import {
  createSharedSolverBuffer,
  type SolverExecutor,
  type SolverTaskDefinition,
} from "@tscircuit/solver-utils"

type RouteAnalysisTasks = {
  "hypergraph/analyze-route": SolverTaskDefinition<
    { routeId: number },
    { usedPortIds: number[]; iterations: number },
    { routeEnds: SharedArrayBuffer }
  >
}

async function analyzeRoutes(
  executor: SolverExecutor<RouteAnalysisTasks>,
  endpoints: Int32Array,
): Promise<number[][]> {
  const shared = { routeEnds: createSharedSolverBuffer(endpoints) }
  const routeCount = endpoints.length / 2
  const results = await Promise.all(
    Array.from({ length: routeCount }, (_, routeId) =>
      executor.execute("hypergraph/analyze-route", { routeId }, { shared }),
    ),
  )
  return results.map((result) => result.usedPortIds)
}
```

This is an example task definition, not a registered handler. A host executor
can implement the intersection of several catalogs and be passed to solvers
using smaller catalogs. Use namespaced task kinds when combining packages.
Pass `{ shared: undefined }` for a task without shared context.

Inputs, results, and context must be structured-cloneable data. Register handlers
by task kind in the host/worker entrypoint; do not send callbacks or solver
instances to workers. Concrete task handlers are registered independently of
the executor transport.

## Node executors

The normal package entrypoint remains free of Node runtime imports. Import
execution adapters from `@tscircuit/solver-utils/node`:

```ts
// tasks.ts: the same handlers are used inline and inside workers.
import type {
  SolverTaskDefinition,
  SolverTaskHandlers,
} from "@tscircuit/solver-utils"

export type Tasks = {
  "example/sum": SolverTaskDefinition<
    { values: number[] },
    number,
    { scale: number }
  >
}

export const handlers: SolverTaskHandlers<Tasks> = {
  "example/sum": (input, context) =>
    input.values.reduce((total, value) => total + value, 0) * context.shared.scale,
}
```

```ts
// worker.ts: compile this module to worker.js for a plain Node host.
import { runSolverWorker } from "@tscircuit/solver-utils/node"
import { handlers, type Tasks } from "./tasks.js"

runSolverWorker<Tasks>(handlers)
```

```ts
// host.ts
import {
  createInlineSolverExecutor,
  createNodeSolverExecutor,
} from "@tscircuit/solver-utils/node"
import { handlers, type Tasks } from "./tasks.js"

const inline = createInlineSolverExecutor<Tasks>(handlers)
const workers = createNodeSolverExecutor<Tasks>({
  workerUrl: new URL("./worker.js", import.meta.url),
  workers: 4,
})

try {
  const input = { values: [1, 2, 3] }
  const context = { shared: { scale: 2 } }
  const expected = await inline.execute("example/sum", input, context)
  const actual = await workers.execute("example/sum", input, context)
  // Both are 12; worker count changes where the handler runs.
} finally {
  await Promise.all([inline.dispose(), workers.dispose()])
}
```

`workers` must be a positive integer. Workers start lazily on the first cloneable
request, announce readiness after handler registration, and are reused across
requests. Each worker executes at most one handler at a time, including async
handlers. The worker module must be loadable by the host runtime: use JavaScript
for plain Node, or TypeScript with a supporting runtime such as Bun.

Inputs and context are snapshotted at submission, even when queued behind other
tasks. Ordinary outputs are isolated as well. Both adapters use native message
transport for cloning so shared buffers retain their backing storage on Bun and
Node. Shared context can contain buffers, views, and ordinary schema metadata;
ordinary metadata is copied for each task. Keep large immutable topology arrays
in shared buffers to avoid copying their bytes.

Handler exceptions and input/output clone failures reject that request and leave
the executor usable. Errors preserve `name`, `message`, and optional `stack`;
custom fields, subclasses, and causes are not transported. Stack text can differ
between hosts. Unknown task kinds are request errors, including inherited names
such as `constructor` and `toString`.

Worker crashes, unexpected exits, invalid replies, or protocol mismatches fail
the pool. All workers are stopped before active requests reject, and work is not
retried automatically. `startupTimeoutMs` defaults to 30,000 ms and limits waiting
for readiness; it does not impose a wall-clock budget on task computation.

`dispose()` rejects new submissions immediately, drains accepted requests, then
terminates the workers. Repeated calls return the same promise. A task that never
finishes also prevents graceful disposal from finishing. The owner must await
disposal before releasing shared storage. Inline disposal follows the same
draining rule. No browser worker adapter is included.

## Shared memory ownership

`createSharedSolverBuffer(view)` copies exactly the view's visible bytes into a
new fixed-size `SharedArrayBuffer`, including subarray and DataView offsets.
Reconstruct the typed view inside a handler, for example
`new Int32Array(context.shared.routeEnds)`.

Allocation and initialization happen once. Worker messaging shares a shared
buffer's backing storage rather than copying its bytes. `SolverSharedMemory`
provides an optional named-buffer shape for contexts with several allocations.
Task-specific context types can also include schema metadata and typed views.

Publish shared topology before submitting tasks and keep it immutable until all
consuming tasks settle. TypeScript `readonly` and `Object.freeze()` do not prevent
writes to shared bytes. Keep occupancy, heaps, random generators, and mutable
search state private to each task. A future task that writes shared output must
own an exclusive range and publish completion before the coordinator reads it.

Shared buffers do not belong in transfer lists. This contract has no transfer
list API: detaching ordinary buffers can change serial behavior. Inline and
worker implementations must provide the same isolation for ordinary input,
context, and output data while preserving intentionally shared backing storage.
Verify these semantics on the supported runtime; adapters must not assume that
every cloning API preserves shared buffers correctly.

## Deterministic consumption

Tasks may finish in any order. Solvers must consume results and algorithmic
failures in original logical order, preserving first-success rules, numerical
reductions, and tie behavior. Promise rejection arrival order must not select a
routing result. Infrastructure failures must surface as failures.

Seeds, candidate sets, cache visibility, and iteration limits belong to solver
inputs and policy. They must not depend on worker count or identity. Task outputs
must include any logical work or prefix state the coordinator needs to reproduce
existing iteration limits. Waiting for a request is not solver work. Every future
integration must verify exact serial parity, including warm caches and budget
boundaries; the interface alone cannot establish that guarantee.

The host retains one executor across stages and child solvers. Only its owner
calls `dispose()`, after solvers stop. Disposal stops new submissions, settles
outstanding requests, and releases workers. Keep executor resources and shared
storage out of algorithm cache keys and reproduction/diagnostic JSON.
