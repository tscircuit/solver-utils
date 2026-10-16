import { Worker } from "node:worker_threads"
import type {
  SolverExecutor,
  SolverTaskCatalog,
  SolverTaskContext,
} from "../SolverExecutor"
import { cloneSolverData } from "./cloneSolverData"
import {
  deserializeSolverTaskError,
  normalizeSolverTaskError,
} from "./solverTaskError"
import {
  SOLVER_WORKER_PROTOCOL_VERSION,
  type SolverWorkerExecuteMessage,
  type SolverWorkerResponseMessage,
} from "./solverWorkerProtocol"

export type NodeSolverExecutorOptions = {
  /** Worker module that registers the task handlers using runSolverWorker(). */
  workerUrl: string | URL
  /** Maximum number of simultaneous tasks, with one task per worker. */
  workers: number
  /** Infrastructure startup deadline; task search budgets remain solver-owned. */
  startupTimeoutMs?: number
}

type Task = {
  id: number
  kind: string
  state: "preparing" | "queued" | "running" | "settled"
  payload?: { input: unknown; context: SolverTaskContext<unknown> }
  promise: Promise<unknown>
  resolve: (output: unknown) => void
  reject: (error: unknown) => void
}

type WorkerSlot = {
  worker: Worker
  ready: boolean
  task?: Task
  startupTimer?: ReturnType<typeof setTimeout>
}

function isWorkerResponse(
  value: unknown,
): value is SolverWorkerResponseMessage {
  if (
    typeof value !== "object" ||
    value === null ||
    !("protocolVersion" in value) ||
    value.protocolVersion !== SOLVER_WORKER_PROTOCOL_VERSION ||
    !("type" in value)
  ) {
    return false
  }
  if (value.type === "ready") return true
  if (
    !("id" in value) ||
    !Number.isSafeInteger(value.id) ||
    Number(value.id) < 0
  ) {
    return false
  }
  if (value.type === "result") return Object.hasOwn(value, "output")
  if (value.type !== "error" || !("error" in value)) return false
  const error = value.error
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    typeof error.name === "string" &&
    "message" in error &&
    typeof error.message === "string" &&
    (!("stack" in error) || typeof error.stack === "string")
  )
}

class NodeSolverExecutor<Tasks extends SolverTaskCatalog<Tasks>>
  implements SolverExecutor<Tasks>
{
  private readonly workerUrl: string | URL
  private readonly workers: number
  private readonly startupTimeoutMs: number
  private readonly slots: WorkerSlot[] = []
  private readonly queue: Task[] = []
  private readonly pending = new Set<Task>()
  private readonly preparations = new Set<Promise<unknown>>()
  private nextId = 0
  private started = false
  private disposed = false
  private stopping = false
  private failure?: Error
  private disposal?: Promise<void>
  private termination?: Promise<void>

  constructor(options: NodeSolverExecutorOptions) {
    if (!Number.isSafeInteger(options.workers) || options.workers < 1) {
      throw new RangeError("Solver worker count must be a positive integer")
    }
    const timeout = options.startupTimeoutMs ?? 30_000
    if (!Number.isFinite(timeout) || timeout <= 0 || timeout > 2_147_483_647) {
      throw new RangeError(
        "Solver worker startup timeout must be between 0 and 2147483647 ms",
      )
    }
    this.workerUrl =
      options.workerUrl instanceof URL
        ? new URL(options.workerUrl.href)
        : options.workerUrl
    this.workers = options.workers
    this.startupTimeoutMs = timeout
  }

  execute<Kind extends keyof Tasks & string>(
    kind: Kind,
    input: Tasks[Kind]["input"],
    context: SolverTaskContext<Tasks[Kind]["shared"]>,
  ): Promise<Tasks[Kind]["output"]> {
    if (this.failure) return Promise.reject(this.failure)
    if (this.disposed)
      return Promise.reject(new Error("Solver executor has been disposed"))
    if (
      typeof kind !== "string" ||
      typeof context !== "object" ||
      context === null ||
      Array.isArray(context) ||
      !Object.hasOwn(context, "shared")
    ) {
      return Promise.reject(
        new TypeError("Solver task requires a kind and shared context"),
      )
    }

    let resolve!: Task["resolve"]
    let reject!: Task["reject"]
    const promise = new Promise<unknown>((onResult, onError) => {
      resolve = onResult
      reject = onError
    })
    const task: Task = {
      id: this.nextId++,
      kind,
      state: "preparing",
      promise,
      resolve,
      reject,
    }
    this.pending.add(task)
    this.queue.push(task)
    // Snapshot synchronously at submission, including tasks waiting for a worker.
    // Native MessageChannel cloning preserves shared backing storage on Bun too.
    const preparation = cloneSolverData({ input, context })
    this.preparations.add(preparation)
    preparation.then(
      (payload) => {
        this.preparations.delete(preparation)
        if (task.state === "settled" || this.failure) return
        task.payload = payload
        task.state = "queued"
        this.dispatch()
      },
      (error: unknown) => {
        this.preparations.delete(preparation)
        if (this.failure) return
        this.settle(task, { error: normalizeSolverTaskError(error) })
        this.dispatch()
      },
    )
    return promise as Promise<Tasks[Kind]["output"]>
  }

  dispose(): Promise<void> {
    if (!this.disposal) {
      this.disposed = true
      this.disposal = Promise.allSettled([
        ...[...this.pending].map((task) => task.promise),
        ...this.preparations,
      ]).then(() => this.terminateWorkers())
    }
    return this.disposal
  }

  private startWorkers(): void {
    if (this.started || this.failure) return
    this.started = true
    try {
      for (let index = 0; index < this.workers; index++) {
        const slot: WorkerSlot = {
          worker: new Worker(this.workerUrl),
          ready: false,
        }
        this.slots.push(slot)
        slot.worker.on("message", (value: unknown) => this.receive(slot, value))
        slot.worker.on("messageerror", (error: Error) => this.fail(error))
        slot.worker.on("error", (error: Error) => this.fail(error))
        slot.worker.on("exit", (code) => {
          if (!this.stopping)
            this.fail(new Error(`Solver worker exited unexpectedly (${code})`))
        })
        slot.startupTimer = setTimeout(() => {
          this.fail(
            new Error(
              "Solver worker did not become ready before the startup deadline",
            ),
          )
        }, this.startupTimeoutMs)
      }
    } catch (error) {
      this.fail(error)
    }
  }

  private dispatch(): void {
    if (this.failure || this.stopping) return
    if (this.nextTask()?.state !== "queued") return
    this.startWorkers()
    if (this.failure) return
    for (const slot of this.slots) {
      if (!slot.ready || slot.task) continue
      const task = this.nextTask()
      if (task?.state !== "queued") break
      this.queue.shift()
      task.state = "running"
      slot.task = task
      const message: SolverWorkerExecuteMessage = {
        type: "execute",
        protocolVersion: SOLVER_WORKER_PROTOCOL_VERSION,
        id: task.id,
        kind: task.kind,
        input: task.payload!.input,
        context: task.payload!.context,
      }
      try {
        slot.worker.postMessage(message)
      } catch (error) {
        if (
          typeof error !== "object" ||
          error === null ||
          !("name" in error) ||
          error.name !== "DataCloneError"
        ) {
          this.fail(error)
          return
        }
        slot.task = undefined
        this.settle(task, { error: normalizeSolverTaskError(error) })
        this.dispatch()
      }
    }
  }

  private nextTask(): Task | undefined {
    while (this.queue[0]?.state === "settled") this.queue.shift()
    return this.queue[0]
  }

  private receive(slot: WorkerSlot, value: unknown): void {
    if (this.failure || this.stopping) return
    if (!isWorkerResponse(value)) {
      this.fail(new Error("Invalid solver worker response or protocol version"))
      return
    }
    if (value.type === "ready") {
      if (slot.ready) {
        this.fail(new Error("Solver worker announced readiness more than once"))
        return
      }
      clearTimeout(slot.startupTimer)
      slot.ready = true
      this.dispatch()
      return
    }
    const task = slot.task
    if (!slot.ready || !task || task.id !== value.id) {
      this.fail(
        new Error("Solver worker response does not match its active request"),
      )
      return
    }
    slot.task = undefined
    if (value.type === "result") {
      this.settle(task, { output: value.output })
    } else {
      this.settle(task, { error: deserializeSolverTaskError(value.error) })
    }
    this.dispatch()
  }

  private settle(
    task: Task,
    result: { output: unknown } | { error: unknown },
  ): void {
    if (task.state === "settled") return
    task.state = "settled"
    this.pending.delete(task)
    if ("error" in result) task.reject(result.error)
    else task.resolve(result.output)
  }

  private fail(cause: unknown): void {
    if (this.failure || this.stopping) return
    this.failure = cause instanceof Error ? cause : new Error(String(cause))
    this.queue.length = 0
    const rejectPending = () => {
      for (const task of this.pending)
        this.settle(task, { error: this.failure })
    }
    // A rejected active request must no longer have a worker reading its shared
    // inputs. Stop all worker execution before exposing infrastructure failure.
    this.terminateWorkers().then(rejectPending, rejectPending)
  }

  private terminateWorkers(): Promise<void> {
    if (!this.termination) {
      this.stopping = true
      for (const slot of this.slots) clearTimeout(slot.startupTimer)
      this.termination = Promise.allSettled(
        this.slots.map((slot) =>
          Promise.resolve().then(() => slot.worker.terminate()),
        ),
      ).then((results) => {
        const failed = results.find((result) => result.status === "rejected")
        if (failed?.status === "rejected") throw failed.reason
      })
    }
    return this.termination
  }
}

/** Create a lazy, persistent worker pool. Disposal drains accepted requests. */
export function createNodeSolverExecutor<
  Tasks extends SolverTaskCatalog<Tasks>,
>(options: NodeSolverExecutorOptions): SolverExecutor<Tasks> {
  return new NodeSolverExecutor<Tasks>(options)
}
