# Shared solver execution contract

`SolverExecutor` is a structural contract for executing typed solver tasks.
Hypergraph, high-density, repair, and other solvers can depend on
`@tscircuit/solver-utils` without importing a parent autorouter package.

The host owns execution resources. Solvers own their algorithms and the order
in which results affect them. Executors run explicitly registered tasks without
changing `BaseSolver` / `BasePipelineSolver` or dispatching existing autorouter
stages automatically.

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

## Runtime-selected execution

Use the same imports and API in browsers and Node. `createSolverExecutor()`
detects a native Node-compatible runtime (including Bun). When a worker module
is supplied, it loads Node's worker support and returns a persistent pool.
Browsers execute the supplied handlers inline and never load the worker module
or Node built-ins. Omitting `workerUrl` selects inline execution in either
runtime. No browser workers are created.

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
import { runSolverWorker } from "@tscircuit/solver-utils"
import { handlers, type Tasks } from "./tasks.js"

await runSolverWorker<Tasks>(handlers)
```

```ts
// host.ts: this code runs in browsers and Node without environment branches.
import {
  createInlineSolverExecutor,
  createSolverExecutor,
} from "@tscircuit/solver-utils"
import { handlers, type Tasks } from "./tasks.js"

const executor = await createSolverExecutor<Tasks>({
  handlers,
  workerUrl: new URL("./worker.js", import.meta.url),
  workers: 4,
})
const reference = createInlineSolverExecutor<Tasks>(handlers)

try {
  const input = { values: [1, 2, 3] }
  const context = { shared: { scale: 2 } }
  const expected = await reference.execute("example/sum", input, context)
  const actual = await executor.execute("example/sum", input, context)
  // Both are 12, whether execution is inline or in Node workers.
} finally {
  await Promise.all([reference.dispose(), executor.dispose()])
}
```

`workers` defaults to 2 and must be a positive integer. Node workers start lazily
on the first cloneable request, announce readiness after handler registration,
and are reused across requests. Each worker executes at most one handler at a
time, including async handlers. The worker module must be loadable by the host
runtime: use JavaScript for plain Node, or TypeScript with a supporting runtime
such as Bun. `runSolverWorker()` is only invoked by that Node worker module;
importing it in browsers is safe.

The factory is asynchronous to load native support only after runtime detection.
Its returned executor has the same interface and lifecycle in both environments.
Node initialization failures surface as errors rather than silently changing
execution policy.

Inputs and context are snapshotted at submission, even when queued behind other
tasks. Ordinary outputs are isolated as well. Both executors use native message
transport for cloning so shared buffers retain their backing storage on Bun and
Node. The inline path uses the browser-compatible global `MessageChannel`.
Shared context can contain buffers, views, and ordinary schema metadata;
ordinary metadata is copied for each task. Keep large immutable topology arrays
in shared buffers to avoid copying their bytes. Tasks using ordinary cloneable
data also work in browsers where shared memory is unavailable.

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
terminates any workers. Repeated calls return the same promise. A task that never
finishes also prevents graceful disposal from finishing. The owner must await
disposal before releasing shared storage. Inline disposal follows the same
draining rule.

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
