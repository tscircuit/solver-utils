# Shared solver execution contract

`SolverExecutor` is a structural contract for executing typed solver tasks.
Hypergraph, high-density, repair, and other solvers can depend on
`@tscircuit/solver-utils` without importing a parent autorouter package.

The host owns execution resources. Solvers own their algorithms and the order
in which results affect them. This initial interface does not create workers,
dispatch existing solver work, or change `BaseSolver` / `BasePipelineSolver`.

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
instances to workers. Executor adapters and concrete task handlers can be added
independently of this contract.

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
