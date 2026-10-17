import {
  BaseSolver,
  SolverRuntime,
  type SolverRuntimeExecutor,
} from "../../lib"

declare global {
  var solverRuntimeTestWorker: boolean | undefined
}

export class SumSolver extends BaseSolver {
  static readonly solverName: string = "SumSolver"

  private output = { sum: 0, worker: false }

  constructor(private input: { values: number[] }) {
    super()
  }

  override _step(): void {
    this.output = {
      sum: this.input.values.reduce((sum, n) => sum + n, 0),
      worker: globalThis.solverRuntimeTestWorker === true,
    }
    this.input.values.push(999)
    this.solved = true
  }

  override getOutput(): { sum: number; worker: boolean } {
    return this.output
  }
}

export class ParentSolver extends BaseSolver {
  static readonly solverName: string = "ParentSolver"

  private output: number[] = []

  constructor(private input: { groups: number[][] }) {
    super()
  }

  override _step(): void {
    this.output = this.input.groups.map((values) => {
      const child = new SumSolver({ values: [...values] })
      child.solve()
      return child.getOutput().sum
    })
    this.solved = true
  }

  async solveAsync(runtime: SolverRuntimeExecutor): Promise<void> {
    const pending = this.input.groups.map((values) =>
      runtime.executeAsync(SumSolver, { values }),
    )
    const outputs = await Promise.all(pending)
    this.output = outputs.map((output) => output.sum)
    this.solved = true
  }

  override getOutput(): number[] {
    return this.output
  }
}

export class FailureSolver extends BaseSolver {
  static readonly solverName: string = "FailureSolver"

  override _step(): void {
    throw new TypeError("intentional solver failure")
  }
}

export class FailedStateSolver extends BaseSolver {
  static readonly solverName: string = "FailedStateSolver"

  override _step(): void {
    this.failed = true
    this.error = "solver reported failure"
  }
}

export class BarrierSolver extends BaseSolver {
  static readonly solverName: string = "BarrierSolver"

  constructor(private input: { buffer: SharedArrayBuffer }) {
    super()
  }

  override _step(): void {
    if (!globalThis.solverRuntimeTestWorker)
      throw new Error("Expected a worker")
    const counters = new Int32Array(this.input.buffer)
    Atomics.add(counters, 0, 1)
    Atomics.notify(counters, 0)
    while (Atomics.load(counters, 0) < 2) {
      if (Atomics.wait(counters, 0, 1, 3000) === "timed-out") {
        throw new Error("Tasks did not execute concurrently")
      }
    }
    this.solved = true
  }

  override getOutput(): number {
    return Atomics.load(new Int32Array(this.input.buffer), 0)
  }
}

export class HangingSolver extends BaseSolver {
  static readonly solverName: string = "HangingSolver"

  constructor(private input: { started?: SharedArrayBuffer }) {
    super()
  }

  async solveAsync(): Promise<void> {
    if (this.input.started) {
      const started = new Int32Array(this.input.started)
      Atomics.store(started, 0, 1)
      Atomics.notify(started, 0)
    }
    await new Promise(() => {})
  }
}

export class ExitSolver extends BaseSolver {
  static readonly solverName: string = "ExitSolver"

  async solveAsync(): Promise<void> {
    process.exit(0)
    await new Promise(() => {})
  }
}

export class IsolationSolver extends BaseSolver {
  static readonly solverName: string = "IsolationSolver"

  constructor(private input: { values: number[]; shared: SharedArrayBuffer }) {
    super()
  }

  override _step(): void {
    this.input.values[0] = 100
    Atomics.add(new Int32Array(this.input.shared), 0, 1)
    this.solved = true
  }

  override getOutput(): { values: number[]; shared: SharedArrayBuffer } {
    return this.input
  }
}

export class UncloneableOutputSolver extends BaseSolver {
  static readonly solverName: string = "UncloneableOutputSolver"

  override _step(): void {
    this.solved = true
  }

  override getOutput(): { callback: () => number } {
    return { callback: () => 42 }
  }
}

SolverRuntime.registerSolver(SumSolver)
SolverRuntime.registerSolver(ParentSolver)
SolverRuntime.registerSolver(FailureSolver)
SolverRuntime.registerSolver(FailedStateSolver)
SolverRuntime.registerSolver(BarrierSolver)
SolverRuntime.registerSolver(HangingSolver)
SolverRuntime.registerSolver(ExitSolver)
SolverRuntime.registerSolver(IsolationSolver)
SolverRuntime.registerSolver(UncloneableOutputSolver)
