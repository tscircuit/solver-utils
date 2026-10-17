import { cloneSolverData } from "./cloneSolverData"
import {
  deserializeSolverError,
  serializeSolverError,
  SOLVER_RUNTIME_PROTOCOL,
  type SolverRequest,
  type SolverResponse,
} from "./protocol"
import type {
  AnySolverCatalog,
  RuntimeSolver,
  SolverConstructor,
  SolverMessageEndpoint,
  SolverRuntimeCatalog,
  SolverRuntimeExecutor,
  SolverRuntimeOptions,
  SolverWorker,
} from "./types"
import { webWorkerEndpoint } from "./webWorkerEndpoint"

type Job = {
  id: number
  name: string
  input: unknown
  resolve: (output: any) => void
  reject: (error: Error) => void
}

type WorkerSlot = {
  worker: SolverWorker
  names: Set<string>
  job: Job | null
  removeListeners: Array<() => void>
}

const constructors = new Map<string, SolverConstructor<any, unknown>>()

/**
 * Registered classes are local code, never serialized functions.
 * Instances default to inline execution; the host owns worker configuration.
 */
export class SolverRuntime<
  Tasks extends SolverRuntimeCatalog<Tasks> = AnySolverCatalog,
> implements SolverRuntimeExecutor<Tasks>
{
  private readonly options: SolverRuntimeOptions
  private readonly slots: WorkerSlot[] = []
  private readonly jobs = new Set<Job>()
  private queue: Job[] = []
  private initialization?: Promise<void>
  private termination?: Promise<void>
  private stopped?: Error
  private nextId = 0

  constructor(options: SolverRuntimeOptions = {}) {
    if (
      !Number.isInteger(options.workerCount ?? 1) ||
      (options.workerCount ?? 1) < 1
    ) {
      throw new Error("workerCount must be a positive integer")
    }
    if (
      !Number.isFinite(options.startupTimeoutMs ?? 10000) ||
      (options.startupTimeoutMs ?? 10000) <= 0
    ) {
      throw new Error("startupTimeoutMs must be positive and finite")
    }
    this.options = options
  }

  static registerSolver<Input, Output>(
    name: string,
    Solver: SolverConstructor<Input, Output>,
  ): void {
    if (!name) throw new Error("Solver name must not be empty")
    const existing = constructors.get(name)
    if (existing && existing !== Solver) {
      throw new Error('Solver "' + name + '" is already registered')
    }
    constructors.set(name, Solver)
  }

  /**
   * Call after importing registration modules in the worker entrypoint.
   * Worker-local child execution is inline: no nested pools or pool starvation.
   */
  static listen(
    endpoint: SolverMessageEndpoint = webWorkerEndpoint(
      globalThis as unknown as Worker,
    ),
  ): () => void {
    const runtime = new SolverRuntime()
    const removeListener = endpoint.onMessage((message): void => {
      const request = message as SolverRequest
      if (request?.solverRuntime !== SOLVER_RUNTIME_PROTOCOL) return
      if (request.type === "hello") {
        endpoint.postMessage({
          solverRuntime: SOLVER_RUNTIME_PROTOCOL,
          type: "ready",
          names: Array.from(constructors.keys()),
        } satisfies SolverResponse)
        return
      }
      if (request.type !== "execute") return
      void runtime.executeAsync(request.name, request.input).then(
        (output): void => {
          try {
            endpoint.postMessage({
              solverRuntime: SOLVER_RUNTIME_PROTOCOL,
              type: "output",
              id: request.id,
              output,
            } satisfies SolverResponse)
          } catch (error) {
            endpoint.postMessage({
              solverRuntime: SOLVER_RUNTIME_PROTOCOL,
              type: "error",
              id: request.id,
              error: serializeSolverError(error),
            } satisfies SolverResponse)
          }
        },
        (error): void =>
          endpoint.postMessage({
            solverRuntime: SOLVER_RUNTIME_PROTOCOL,
            type: "error",
            id: request.id,
            error: serializeSolverError(error),
          } satisfies SolverResponse),
      )
    })
    return (): void => {
      removeListener()
      void runtime.dispose()
    }
  }

  executeAsync<Name extends keyof Tasks & string>(
    name: Name,
    input: Tasks[Name]["input"],
  ): Promise<Tasks[Name]["output"]> {
    if (this.stopped) return Promise.reject(this.stopped)
    // Snapshot at submission, before initialization or queueing can yield.
    const snapshot = cloneSolverData(input)
    return new Promise((resolve, reject) => {
      const job: Job = {
        id: this.nextId++,
        name,
        input: undefined,
        resolve,
        reject,
      }
      this.jobs.add(job)
      void snapshot.then(
        async (value): Promise<void> => {
          job.input = value
          try {
            await this.initialize()
            if (!this.jobs.has(job)) return
            if (this.slots.some((slot) => slot.names.has(name))) {
              this.queue.push(job)
              this.dispatch()
            } else if (this.options.requireWorker) {
              throw new Error('No worker registered solver "' + name + '"')
            } else {
              const output = await this.executeInline(name, value)
              this.finish(job, undefined, output)
            }
          } catch (error) {
            this.finish(
              job,
              error instanceof Error ? error : new Error(String(error)),
            )
          }
        },
        (error): void => {
          this.finish(
            job,
            error instanceof Error ? error : new Error(String(error)),
          )
        },
      )
    })
  }

  private async executeInline(name: string, input: unknown): Promise<unknown> {
    const Solver = constructors.get(name)
    if (!Solver) throw new Error('Unknown solver "' + name + '"')
    const solver: RuntimeSolver = new Solver(input)
    if (solver.solveAsync) {
      // A catalog narrows callers; registration remains an open runtime boundary.
      await solver.solveAsync(this as SolverRuntimeExecutor)
    } else {
      solver.solve()
    }
    if (solver.failed) {
      throw new Error(solver.error || 'Solver "' + name + '" failed')
    }
    return cloneSolverData(solver.getOutput())
  }

  private initialize(): Promise<void> {
    if (!this.initialization) {
      this.initialization = this.startWorkers()
    }
    return this.initialization
  }

  private async startWorkers(): Promise<void> {
    if (!this.options.createWorker) return
    try {
      await Promise.all(
        Array.from({ length: this.options.workerCount ?? 1 }, () =>
          this.startWorker(),
        ),
      )
    } catch (error) {
      const failure = error instanceof Error ? error : new Error(String(error))
      await this.terminateWorkers()
      if (this.stopped) throw this.stopped
      if (
        this.options.startupFailure === "serial" &&
        !this.options.requireWorker
      ) {
        if (this.options.onDiagnostic) this.options.onDiagnostic(failure)
        else
          console.warn(
            "SolverRuntime: worker startup failed; using serial execution",
            failure,
          )
      } else {
        this.stop(failure)
        throw failure
      }
    }
  }

  private async startWorker(): Promise<void> {
    if (this.stopped) return Promise.reject(this.stopped)
    const worker = this.options.createWorker!()
    const slot: WorkerSlot = {
      worker,
      names: new Set(),
      job: null,
      removeListeners: [],
    }
    this.slots.push(slot)
    return new Promise((resolve, reject) => {
      let ready = false
      const timer = setTimeout((): void => {
        reject(new Error("Solver worker startup timed out"))
      }, this.options.startupTimeoutMs ?? 10000)
      slot.removeListeners.push((): void => {
        clearTimeout(timer)
        if (!ready)
          reject(this.stopped ?? new Error("Solver worker startup interrupted"))
      })
      slot.removeListeners.push(
        worker.onError((error): void => {
          if (!ready) {
            clearTimeout(timer)
            reject(error)
          } else {
            this.stop(error)
            this.terminateAfterFailure()
          }
        }),
      )
      slot.removeListeners.push(
        worker.onMessage((message): void => {
          const response = message as SolverResponse
          if (response?.solverRuntime !== SOLVER_RUNTIME_PROTOCOL) return
          if (
            !ready &&
            response.type === "ready" &&
            Array.isArray(response.names)
          ) {
            ready = true
            clearTimeout(timer)
            slot.names = new Set(response.names)
            resolve()
          } else if (
            ready &&
            slot.job &&
            (response.type === "output" || response.type === "error") &&
            response.id === slot.job.id
          ) {
            const job = slot.job
            slot.job = null
            if (response.type === "error") {
              this.finish(job, deserializeSolverError(response.error))
            } else {
              this.finish(job, undefined, response.output)
            }
            this.dispatch()
          } else {
            const error = new Error("Invalid solver worker protocol response")
            clearTimeout(timer)
            reject(error)
            this.stop(error)
            this.terminateAfterFailure()
          }
        }),
      )
      try {
        worker.postMessage({
          solverRuntime: SOLVER_RUNTIME_PROTOCOL,
          type: "hello",
        } satisfies SolverRequest)
      } catch (error) {
        clearTimeout(timer)
        reject(error)
      }
    })
  }

  private dispatch(): void {
    if (this.stopped) return
    for (const slot of this.slots) {
      if (slot.job) continue
      const index = this.queue.findIndex((job) => slot.names.has(job.name))
      if (index === -1) continue
      const job = this.queue.splice(index, 1)[0]!
      slot.job = job
      try {
        slot.worker.postMessage({
          solverRuntime: SOLVER_RUNTIME_PROTOCOL,
          type: "execute",
          id: job.id,
          name: job.name,
          input: job.input,
        } satisfies SolverRequest)
      } catch (error) {
        slot.job = null
        this.finish(
          job,
          error instanceof Error ? error : new Error(String(error)),
        )
        this.dispatch()
      }
    }
  }

  private finish(job: Job, error?: Error, output?: unknown): void {
    if (!this.jobs.delete(job)) return
    if (error) job.reject(error)
    else job.resolve(output)
  }

  private stop(error: Error): void {
    this.stopped = error
    this.queue = []
    for (const job of this.jobs) this.finish(job, error)
  }

  private async terminateWorkers(): Promise<void> {
    if (this.termination) return this.termination
    const slots = this.slots.splice(0)
    for (const slot of slots) {
      for (const remove of slot.removeListeners) remove()
    }
    this.termination = Promise.allSettled(
      slots.map(async (slot): Promise<void> => {
        await slot.worker.terminate()
      }),
    ).then((results): void => {
      const failures = results.filter((result) => result.status === "rejected")
      if (failures.length) {
        throw new AggregateError(
          failures.map((result) => result.reason),
          "Could not terminate solver workers",
        )
      }
    })
    return this.termination
  }

  private terminateAfterFailure(): void {
    void this.terminateWorkers().catch((error: Error): void => {
      if (this.options.onDiagnostic) this.options.onDiagnostic(error)
      else console.error("SolverRuntime: worker cleanup failed", error)
    })
  }

  async dispose(): Promise<void> {
    this.stop(new Error("Solver runtime disposed"))
    await this.terminateWorkers()
  }
}
