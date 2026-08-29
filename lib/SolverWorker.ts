import type { GraphicsObject } from "graphics-debug"
import { BaseSolver, type BaseSolverSnapshot } from "./BaseSolver"
import { getErrorMessage, toStructuredCloneSafe } from "./structured-clone"

export const SOLVER_WORKER_CHANNEL = "solver-worker"

export interface SolverWorkerEndpoint {
  postMessage(message: unknown, transfer?: Transferable[]): void
  addEventListener(
    type: "message",
    listener: (event: MessageEvent<unknown>) => void,
  ): void
  removeEventListener?(
    type: "message",
    listener: (event: MessageEvent<unknown>) => void,
  ): void
  start?(): void
}

export interface SolverWorkerClientEndpoint extends SolverWorkerEndpoint {
  terminate?(): void
}

export interface SolveInWorkerOptions {
  snapshotEvery?: number
}

export type SolverWorkerRequestPayload =
  | {
      action: "init"
      args: unknown[]
    }
  | {
      action: "step"
    }
  | {
      action: "solve"
      snapshotEvery?: number
    }
  | {
      action: "getSnapshot"
    }
  | {
      action: "getOutput"
    }
  | {
      action: "getConstructorParams"
    }
  | {
      action: "visualize"
    }
  | {
      action: "preview"
    }
  | {
      action: "call"
      methodName: string
      args: unknown[]
    }
  | {
      action: "dispose"
    }

export type SolverWorkerRequest = SolverWorkerRequestPayload & {
  channel: typeof SOLVER_WORKER_CHANNEL
  kind: "request"
  requestId: number
}

export interface SolverWorkerSnapshotEvent {
  channel: typeof SOLVER_WORKER_CHANNEL
  kind: "event"
  event: "snapshot"
  snapshot: BaseSolverSnapshot
}

export interface SolverWorkerSuccessResponse<TResult = unknown> {
  channel: typeof SOLVER_WORKER_CHANNEL
  kind: "response"
  requestId: number
  ok: true
  result: TResult
  snapshot: BaseSolverSnapshot | null
}

export interface SolverWorkerErrorResponse {
  channel: typeof SOLVER_WORKER_CHANNEL
  kind: "response"
  requestId: number
  ok: false
  error: string
  snapshot: BaseSolverSnapshot | null
}

export type SolverWorkerResponse<TResult = unknown> =
  | SolverWorkerSuccessResponse<TResult>
  | SolverWorkerErrorResponse

export type SolverWorkerMessage =
  | SolverWorkerRequest
  | SolverWorkerResponse
  | SolverWorkerSnapshotEvent

type SolverConstructor<TSolver extends BaseSolver> = new (
  ...args: any[]
) => TSolver

type SolverFactory<TSolver extends BaseSolver> = (...args: any[]) => TSolver

export type SolverWorkerDefinition<TSolver extends BaseSolver> =
  | SolverConstructor<TSolver>
  | {
      solverClass?: SolverConstructor<TSolver>
      createSolver?: SolverFactory<TSolver>
      target?: SolverWorkerEndpoint
    }

export interface AsyncSolverLike<
  TSnapshot extends BaseSolverSnapshot = BaseSolverSnapshot,
> {
  readonly snapshot: TSnapshot | null
  readonly solverName: string | null
  readonly solved: boolean
  readonly failed: boolean
  readonly iterations: number
  readonly progress: number
  readonly error: string | null
  readonly stats: Record<string, unknown>
  readonly state: Record<string, unknown>
  readonly activeSubSolver: BaseSolverSnapshot | null
  init(...args: unknown[]): Promise<TSnapshot>
  step(): Promise<TSnapshot>
  solve(options?: SolveInWorkerOptions): Promise<TSnapshot>
  syncSnapshot(): Promise<TSnapshot>
  getOutput<TOutput = unknown>(): Promise<TOutput>
  getConstructorParams<TArgs extends unknown[] = unknown[]>(): Promise<TArgs>
  visualize(): Promise<GraphicsObject>
  preview(): Promise<GraphicsObject>
  call<TResult = unknown>(
    methodName: string,
    ...args: unknown[]
  ): Promise<TResult>
  subscribe(listener: (snapshot: TSnapshot) => void): () => void
  dispose(): Promise<void>
  terminate(): void
}

function isSolverWorkerMessage(
  message: unknown,
): message is SolverWorkerMessage {
  if (!message || typeof message !== "object") {
    return false
  }

  const candidate = message as Partial<SolverWorkerMessage>
  return candidate.channel === SOLVER_WORKER_CHANNEL
}

function getSnapshotEvery(snapshotEvery?: number): number | null {
  if (!snapshotEvery || !Number.isFinite(snapshotEvery)) {
    return null
  }

  return Math.max(1, Math.floor(snapshotEvery))
}

function serializeWorkerResult(value: unknown): unknown {
  if (value instanceof BaseSolver) {
    return value.getSerializableSnapshot()
  }

  if (
    Array.isArray(value) &&
    value.every((entry) => entry instanceof BaseSolver)
  ) {
    return value.map((entry) => entry.getSerializableSnapshot())
  }

  return toStructuredCloneSafe(value)
}

function getDefaultWorkerEndpoint(): SolverWorkerEndpoint {
  const defaultTarget = globalThis as Partial<SolverWorkerEndpoint>
  if (
    typeof defaultTarget.postMessage === "function" &&
    typeof defaultTarget.addEventListener === "function"
  ) {
    return defaultTarget as SolverWorkerEndpoint
  }

  throw new Error(
    "No worker endpoint was found. Pass target explicitly when registering the solver worker.",
  )
}

function resolveCreateSolver<TSolver extends BaseSolver>(
  definition: SolverWorkerDefinition<TSolver>,
): {
  createSolver: SolverFactory<TSolver>
  target?: SolverWorkerEndpoint
} {
  if (typeof definition === "function") {
    return {
      createSolver: (...args) => new definition(...args),
    }
  }

  if (definition.createSolver) {
    return {
      createSolver: definition.createSolver,
      target: definition.target,
    }
  }

  if (definition.solverClass) {
    return {
      createSolver: (...args) => new definition.solverClass!(...args),
      target: definition.target,
    }
  }

  throw new Error(
    "Solver worker registration requires either solverClass or createSolver.",
  )
}

function requireSolver<TSolver extends BaseSolver>(
  solver: TSolver | null,
): TSolver {
  if (!solver) {
    throw new Error("Solver has not been initialized. Call init(...) first.")
  }

  return solver
}

function solveSolver(
  solver: BaseSolver,
  snapshotEvery: number | null,
  emitSnapshot: (snapshot: BaseSolverSnapshot) => void,
): BaseSolverSnapshot {
  const startTime = Date.now()
  let lastEmittedIteration = -1

  while (!solver.solved && !solver.failed) {
    solver.step()

    if (
      snapshotEvery &&
      solver.iterations % snapshotEvery === 0 &&
      solver.iterations !== lastEmittedIteration
    ) {
      emitSnapshot(solver.getSerializableSnapshot())
      lastEmittedIteration = solver.iterations
    }
  }

  solver.timeToSolve = Date.now() - startTime

  const finalSnapshot = solver.getSerializableSnapshot()
  if (snapshotEvery && solver.iterations !== lastEmittedIteration) {
    emitSnapshot(finalSnapshot)
  }

  return finalSnapshot
}

export function exposeSolverWorker<TSolver extends BaseSolver>(
  definition: SolverWorkerDefinition<TSolver>,
): () => void {
  const { createSolver, target: explicitTarget } =
    resolveCreateSolver(definition)
  const target = explicitTarget ?? getDefaultWorkerEndpoint()
  let solver: TSolver | null = null

  const postMessage = (message: SolverWorkerMessage) => {
    target.postMessage(toStructuredCloneSafe(message))
  }

  const emitSnapshot = (snapshot: BaseSolverSnapshot) => {
    postMessage({
      channel: SOLVER_WORKER_CHANNEL,
      kind: "event",
      event: "snapshot",
      snapshot,
    })
  }

  const handleMessage = async (event: MessageEvent<unknown>) => {
    const message = event.data
    if (!isSolverWorkerMessage(message) || message.kind !== "request") {
      return
    }

    try {
      let result: unknown = null

      switch (message.action) {
        case "init": {
          solver = createSolver(...message.args)
          result = solver.getSerializableSnapshot()
          break
        }
        case "step": {
          const activeSolver = requireSolver(solver)
          activeSolver.step()
          result = activeSolver.getSerializableSnapshot()
          break
        }
        case "solve": {
          const activeSolver = requireSolver(solver)
          result = solveSolver(
            activeSolver,
            getSnapshotEvery(message.snapshotEvery),
            emitSnapshot,
          )
          break
        }
        case "getSnapshot": {
          result = requireSolver(solver).getSerializableSnapshot()
          break
        }
        case "getOutput": {
          result = requireSolver(solver).getOutput()
          break
        }
        case "getConstructorParams": {
          result = requireSolver(solver).getConstructorParams()
          break
        }
        case "visualize": {
          result = requireSolver(solver).visualize()
          break
        }
        case "preview": {
          result = requireSolver(solver).preview()
          break
        }
        case "call": {
          const activeSolver = requireSolver(solver)
          const candidate = (activeSolver as any)[message.methodName]

          if (typeof candidate !== "function") {
            throw new Error(
              `Solver method "${message.methodName}" does not exist or is not callable.`,
            )
          }

          result = await candidate.apply(activeSolver, message.args)
          break
        }
        case "dispose": {
          solver = null
          result = null
          break
        }
        default: {
          const exhaustiveCheck: never = message
          throw new Error(
            `Unsupported worker action: ${String(exhaustiveCheck)}`,
          )
        }
      }

      postMessage({
        channel: SOLVER_WORKER_CHANNEL,
        kind: "response",
        requestId: message.requestId,
        ok: true,
        result: serializeWorkerResult(result),
        snapshot: solver?.getSerializableSnapshot() ?? null,
      })
    } catch (error) {
      postMessage({
        channel: SOLVER_WORKER_CHANNEL,
        kind: "response",
        requestId: message.requestId,
        ok: false,
        error: getErrorMessage(error),
        snapshot: solver?.getSerializableSnapshot() ?? null,
      })
    }
  }

  target.addEventListener("message", handleMessage)
  target.start?.()

  return () => {
    target.removeEventListener?.("message", handleMessage)
  }
}

type PendingRequest<TResult> = {
  resolve: (response: SolverWorkerSuccessResponse<TResult>) => void
  reject: (error: Error) => void
}

export class SolverWorkerClient<
  TSnapshot extends BaseSolverSnapshot = BaseSolverSnapshot,
> implements AsyncSolverLike<TSnapshot>
{
  private nextRequestId = 1
  private pendingRequests = new Map<number, PendingRequest<unknown>>()
  private snapshotListeners = new Set<(snapshot: TSnapshot) => void>()
  private currentSnapshot: TSnapshot | null = null

  constructor(private readonly target: SolverWorkerClientEndpoint) {
    this.target.addEventListener("message", this.handleMessage)
    this.target.start?.()
  }

  static async create<
    TSnapshot extends BaseSolverSnapshot = BaseSolverSnapshot,
  >(
    target: SolverWorkerClientEndpoint,
    ...args: unknown[]
  ): Promise<SolverWorkerClient<TSnapshot>> {
    const client = new SolverWorkerClient<TSnapshot>(target)
    await client.init(...args)
    return client
  }

  get snapshot(): TSnapshot | null {
    return this.currentSnapshot
  }

  get solverName(): string | null {
    return this.currentSnapshot?.solverName ?? null
  }

  get solved(): boolean {
    return this.currentSnapshot?.solved ?? false
  }

  get failed(): boolean {
    return this.currentSnapshot?.failed ?? false
  }

  get iterations(): number {
    return this.currentSnapshot?.iterations ?? 0
  }

  get progress(): number {
    return this.currentSnapshot?.progress ?? 0
  }

  get error(): string | null {
    return this.currentSnapshot?.error ?? null
  }

  get stats(): Record<string, unknown> {
    return this.currentSnapshot?.stats ?? {}
  }

  get state(): Record<string, unknown> {
    return this.currentSnapshot?.state ?? {}
  }

  get activeSubSolver(): BaseSolverSnapshot | null {
    return this.currentSnapshot?.activeSubSolver ?? null
  }

  async init(...args: unknown[]): Promise<TSnapshot> {
    return this.requestSnapshot({
      action: "init",
      args,
    })
  }

  async step(): Promise<TSnapshot> {
    return this.requestSnapshot({
      action: "step",
    })
  }

  async solve(options: SolveInWorkerOptions = {}): Promise<TSnapshot> {
    return this.requestSnapshot({
      action: "solve",
      snapshotEvery: options.snapshotEvery,
    })
  }

  async syncSnapshot(): Promise<TSnapshot> {
    return this.requestSnapshot({
      action: "getSnapshot",
    })
  }

  async getOutput<TOutput = unknown>(): Promise<TOutput> {
    const response = await this.request<TOutput>({
      action: "getOutput",
    })
    return response.result
  }

  async getConstructorParams<
    TArgs extends unknown[] = unknown[],
  >(): Promise<TArgs> {
    const response = await this.request<TArgs>({
      action: "getConstructorParams",
    })
    return response.result
  }

  async visualize(): Promise<GraphicsObject> {
    const response = await this.request<GraphicsObject>({
      action: "visualize",
    })
    return response.result
  }

  async preview(): Promise<GraphicsObject> {
    const response = await this.request<GraphicsObject>({
      action: "preview",
    })
    return response.result
  }

  async call<TResult = unknown>(
    methodName: string,
    ...args: unknown[]
  ): Promise<TResult> {
    const response = await this.request<TResult>({
      action: "call",
      methodName,
      args,
    })
    return response.result
  }

  subscribe(listener: (snapshot: TSnapshot) => void): () => void {
    this.snapshotListeners.add(listener)

    if (this.currentSnapshot) {
      listener(this.currentSnapshot)
    }

    return () => {
      this.snapshotListeners.delete(listener)
    }
  }

  async dispose(): Promise<void> {
    await this.request<void>({
      action: "dispose",
    })
  }

  terminate(): void {
    this.teardown()
    this.target.terminate?.()
  }

  private handleMessage = (event: MessageEvent<unknown>) => {
    const message = event.data
    if (!isSolverWorkerMessage(message)) {
      return
    }

    if (message.kind === "request") {
      return
    }

    if (message.kind === "event") {
      this.setSnapshot(message.snapshot as TSnapshot)
      return
    }

    this.setSnapshot(message.snapshot as TSnapshot | null)

    const pending = this.pendingRequests.get(message.requestId)
    if (!pending) {
      return
    }

    this.pendingRequests.delete(message.requestId)

    if (message.ok) {
      pending.resolve(message)
      return
    }

    pending.reject(new Error(message.error))
  }

  private setSnapshot(snapshot: TSnapshot | null) {
    this.currentSnapshot = snapshot

    if (!snapshot) {
      return
    }

    for (const listener of this.snapshotListeners) {
      listener(snapshot)
    }
  }

  private async request<TResult>(
    message: SolverWorkerRequestPayload,
  ): Promise<SolverWorkerSuccessResponse<TResult>> {
    const requestId = this.nextRequestId++
    const request: SolverWorkerRequest = {
      channel: SOLVER_WORKER_CHANNEL,
      kind: "request",
      requestId,
      ...message,
    }

    const responsePromise = new Promise<SolverWorkerSuccessResponse<TResult>>(
      (resolve, reject) => {
        this.pendingRequests.set(requestId, {
          resolve: resolve as PendingRequest<unknown>["resolve"],
          reject,
        })
      },
    )

    this.target.postMessage(toStructuredCloneSafe(request))
    return responsePromise
  }

  private async requestSnapshot(
    message: SolverWorkerRequestPayload,
  ): Promise<TSnapshot> {
    const response = await this.request<TSnapshot>(message)
    if (!response.snapshot) {
      throw new Error("Solver worker did not return a snapshot.")
    }

    return response.snapshot as TSnapshot
  }

  private teardown() {
    this.target.removeEventListener?.("message", this.handleMessage)

    for (const [requestId, pending] of this.pendingRequests) {
      this.pendingRequests.delete(requestId)
      pending.reject(new Error("Solver worker client was terminated."))
    }

    this.snapshotListeners.clear()
    this.currentSnapshot = null
  }
}
