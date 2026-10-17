# SolverRuntime

Register solver constructors once, then select execution resources at the host.
The default import works inline in browsers, eval workers, Bun, and Node without
importing Node builtins or an embedded worker payload.

```ts
import { BaseSolver, SolverRuntime } from "@tscircuit/solver-utils"

class SumSolver extends BaseSolver {
  static readonly solverName: string = "SumSolver"

  private sum = 0

  constructor(private input: { values: number[] }) {
    super()
  }

  override _step(): void {
    this.sum = this.input.values.reduce((sum, value) => sum + value, 0)
    this.solved = true
  }

  override getOutput(): number {
    return this.sum
  }
}

SolverRuntime.registerSolver(SumSolver)

const runtime = new SolverRuntime()
try {
  const sum = await runtime.executeAsync("SumSolver", { values: [20, 22] })
  const sameSum = await runtime.executeAsync(SumSolver, { values: [20, 22] })
} finally {
  await runtime.dispose()
}
```

Every registered class must define its own non-empty static `solverName`, including
subclasses. No constructor-name inference or separate name/fallback argument is
used. Registration is idempotent for the same class; a different class with the
same name throws. Class invocation resolves that static name and uses the same
registry and worker selection as string invocation; it does not auto-register.
Only the name and data are sent to workers, never the class itself. Class calls
infer constructor input and `getOutput()` types; typed catalogs check string calls.
Registration modules must execute in both the host and worker bundles.

## Synchronous leaves and async orchestration

For each request the runtime constructs the registered class, calls
`solveAsync(runtime)` if implemented (otherwise `solve()`), rejects a reported
`failed` state, and returns `getOutput()`. It returns data, not a remote instance.
Existing `BaseSolver`, `.step()`, and `.solve()` behavior is unchanged.

A synchronous solver can be a worker task. Only an async orchestrator awaits
child requests:

```ts
import type { SolverRuntimeExecutor } from "@tscircuit/solver-utils"

type Tasks = {
  "SumSolver": { input: { values: number[] }; output: number }
}

// Inside a parent solver:
async solveAsync(runtime: SolverRuntimeExecutor<Tasks>): Promise<void> {
  const pending = this.groups.map((values) =>
    runtime.executeAsync("SumSolver", { values }),
  )
  this.outputs = await Promise.all(pending) // submission order, not arrival order
  this.solved = true
}
```

Construct the parent on the host and call `await parent.solveAsync(runtime)`
to fan its child tasks across the pool. A parent submitted as a task itself may
run in a worker; its descendants then execute inline in that worker. This
deliberate initial policy avoids nested pools and starvation, but does not
parallelize that parent's descendants. Solvers retain their serial `.solve()`
implementation for debugging/parity. The runtime cannot infer equivalent
iteration budgets, cache behavior, seeds, or algorithmic commit order.

## Bun and Node workers

Each optional entry exports a `SolverRuntime` subclass sharing the default
entry's registry. Prefer `/runtime/bun` on Bun; use `/runtime/node` on Node.
Threaded execution under Bun requires Bun 1.4.2 or newer; older versions have
worker cleanup bugs. The inline runtime remains available on older Bun.

```ts
// worker.bun.ts
import { SolverRuntime } from "@tscircuit/solver-utils/runtime/bun"
import "./registered-solvers"
SolverRuntime.listen()

// worker.node.ts: same code, importing /runtime/node instead.
// listen() installs one dispatcher and returns a function that removes it.
```

```ts
// Host on Bun; use /runtime/node for the Node host.
import { SolverRuntime } from "@tscircuit/solver-utils/runtime/bun"
import workerSource from "./generated/worker-source"
import "./registered-solvers"

const runtime = new SolverRuntime({
  workerSource,
  workerCount: 4,
  requireWorker: true,
})
try {
  const parent = new ParentSolver(input)
  await parent.solveAsync(runtime)
  const output = parent.getOutput()
} finally {
  await runtime.dispose()
}
```

The host builds its worker entrypoint **at package build time**, bundling its
registration modules and dependencies into one file with no relative imports or
assets, then exports that file's text as `workerSource`. Bun expects a module
bundle and launches a Blob URL; Node expects CommonJS and uses `eval: true`.
No callbacks are serialized and no adjacent worker file needs locating after
rebundling. solver-utils cannot prebundle application-specific registrations.
Do not put top-level await before Bun's listener installation.

For example, a host's build script can generate its Bun payload with:

```ts
const build = await Bun.build({
  entrypoints: ["./worker.bun.ts"],
  target: "bun",
  format: "esm",
  splitting: false,
})
if (!build.success || build.outputs.length !== 1) {
  throw new Error("Worker must build into one self-contained file")
}
await Bun.write(
  "./generated/worker-source.ts",
  "export default " + JSON.stringify(await build.outputs[0]!.text()),
)
// For Node: worker.node.ts, target: "node", format: "cjs".
```

For unbundled applications/tests, `workerUrl: new URL("./worker.ts", import.meta.url)`
is also supported (use emitted JavaScript on Node). This explicit alternative
retains the caller's responsibility for shipping and resolving that file.

Workers are created lazily, advertise registered names during startup, and are
reused across calls. `workerCount` limits active tasks. Worker-local runtimes
never create more workers. Keep one host-owned runtime across pipeline stages;
only its owner disposes it. CLI file workers and routing pools must share one CPU
budget. An application may supply its own transport using the default runtime's
`createWorker` option and `SolverMessageEndpoint`/`SolverWorker` contracts.

## Execution selection and failures

- No worker configuration: execute the locally registered constructor.
- Worker lacks a name: execute its locally registered constructor. If neither
  context registered it, reject.
- `requireWorker: true`: reject rather than execute locally. Use this in parity
  and packaging tests to prove threads actually run.
- Startup failure: throw by default. Opt into `startupFailure: "serial"` to
  execute locally, with `onDiagnostic(error)` or a console warning. This includes
  missing assets and a startup handshake timeout (`startupTimeoutMs`, default
  10 seconds). Strict worker mode overrides this policy.
- After dispatch: solver errors and failed states reject; unexpected worker exits
  stop the runtime and reject outstanding/future work. Never race a slow task
  against a serial retry. There is no task-duration timeout.
- `dispose()` rejects outstanding/new requests and terminates owned workers.
  Inline synchronous computation cannot be interrupted; there are no per-task
  cancellation or progress APIs in this initial implementation.

Inputs are snapshotted at submission and outputs cloned in both modes. Ordinary
objects/buffers stay isolated; SharedArrayBuffer backing storage intentionally
stays shared. Use native message cloning, including inline, to preserve those
semantics on older Bun versions. Publish shared inputs before submission and
keep them immutable; shared writes need explicit ownership/synchronization.

This class registry is separate from the existing structural `SolverExecutor`
task/shared-context contract. Existing implementations of that contract continue
to work; this PR does not migrate downstream solvers or change core/eval/CLI.
