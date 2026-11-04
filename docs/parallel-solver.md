# Synchronous parallel solver pattern

`ParallelSolver` extends the existing `BaseSolver` with a deterministic batch
boundary. Both `.step()` and `.solve()` remain synchronous. `BaseSolver` and
`BasePipelineSolver` are unchanged, and no asynchronous lifecycle is added.

One step prepares a fixed batch, waits for the runtime's complete result set,
validates it, then commits once in logical input order. A runtime can implement
that barrier using inline execution or blocking worker coordination.

```ts
import {
  ParallelSolver,
  SingleThreadSolverRuntime,
  type ParallelSolverOptions,
  type ParallelTaskBatch,
} from "@tscircuit/solver-utils"

class SquaresSolver extends ParallelSolver<number, number> {
  output: number[] = []
  private offset = 0

  constructor(private input: number[], options?: ParallelSolverOptions) {
    super(options)
  }

  protected getNextBatch(): ParallelTaskBatch<number, number> | null {
    if (this.offset === this.input.length) return null
    return {
      // Logical batch size is fixed, independent of worker count.
      inputs: this.input.slice(this.offset, this.offset + 32),
      shared: undefined,
      runTask: (value) => value * value,
    }
  }

  protected commitBatch(outputs: readonly number[]): boolean {
    this.output.push(...outputs)
    this.offset += outputs.length
    return this.offset === this.input.length
  }

  override getOutput() { return this.output }
}

const runtime = new SingleThreadSolverRuntime()
const solver = new SquaresSolver([4, 1, 3], { runtime })
solver.step() // The complete logical batch is committed before this returns.
const output = solver.getOutput() // [16, 1, 9]
runtime.dispose()
```

Return `null` from `getNextBatch()` when there is no work. Return `true` from
`commitBatch()` when the successful commit finishes the solver. Existing setup,
iteration limits, progress, failure state, and visualization remain available.
Override these batch hooks rather than `step()` or `_step()`.

## Runtime contract

```ts
interface SolverRuntime {
  runBatch<Input, Output, Shared>(
    batch: ParallelTaskBatch<Input, Output, Shared>,
  ): readonly ParallelTaskOutcome<Output>[]
  dispose(): void
}
```

A batch contains `inputs`, `shared`, and synchronous `runTask(input, { shared })`
logic. Each outcome identifies its original `taskIndex` and contains either an
output or an error's name and message. A runtime may return outcomes in any
order, but must return exactly one settled outcome per input before returning.
Task failures are outcomes; infrastructure failures may throw.

The initial implementation is `SingleThreadSolverRuntime`, a synchronous
reference implementation. It snapshots all inputs before running any task,
copies ordinary shared metadata per task, and isolates ordinary outputs.
`SharedArrayBuffer` backing storage stays shared, including through offset views.
Promises returned by task handlers are rejected as task failures.

This PR establishes the class and runtime contract. It does not add a Node
worker backend or claim a routing speedup. A future worker runtime must provide
a synchronous completion barrier and meet the same parity tests. Solvers will
continue using the same `step()` implementation with that runtime.

## Runtime selection and lifetime

Parallel solvers default to `SolverRuntime.defaultRuntime`, initially a
`SingleThreadSolverRuntime`. They capture the default when constructed.
`solver.setRuntime(runtime)` supports existing constructor shapes and returns
the solver. It cannot change the runtime during a step.

The runtime owner calls `dispose()` after its solvers finish. A solver finishing
or failing does not dispose a runtime shared with other solvers. These settings
apply to `ParallelSolver`; the existing `BaseSolver` interface is unchanged.

## Deterministic guarantees and algorithm requirements

The base class freezes the submitted batch and its input order, and enforces
complete, unique input indices before committing. It
rejects missing, duplicate, out-of-range, malformed, or unsettled outcomes.
Successful outputs reach one `commitBatch()` call in input order, in a frozen
array. If any task fails, the lowest input index supplies the error and the
batch is not committed. Completion order never chooses a result or error.

These are scheduling guarantees. Tasks must themselves be deterministic:
use explicit seeds and work budgets, avoid clock-based decisions, and keep
shared topology read-only. Task code must not capture and mutate coordinator
state. Batch preparation must not change solver state. Keep mutable task search
state private, and make coordinator changes in `commitBatch()`.

Logical batches and commit boundaries must not depend on thread count. Preserve
floating-point reduction order and tie-breaking inside the ordered commit.
Tests compare every debug step's state with full solves and reordered runtime
outcomes, including failures and iteration limits.
