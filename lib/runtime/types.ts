/** A catalog can be shared by parent solvers and their execution host. */
export type SolverRuntimeCatalog<Tasks> = {
  [Name in keyof Tasks]: { input: unknown; output: unknown }
}

export type AnySolverCatalog = Record<string, { input: any; output: any }>

export interface SolverRuntimeExecutor<
  Tasks extends SolverRuntimeCatalog<Tasks> = AnySolverCatalog,
> {
  executeAsync<Solver extends SolverConstructor<any, any>>(
    Solver: Solver,
    input: ConstructorParameters<Solver>[0],
  ): Promise<ReturnType<InstanceType<Solver>["getOutput"]>>

  executeAsync<Name extends keyof Tasks & string>(
    name: Name,
    input: Tasks[Name]["input"],
  ): Promise<Tasks[Name]["output"]>
}

export interface RuntimeSolver<Output = unknown> {
  solve(): void
  solveAsync?(runtime: SolverRuntimeExecutor): Promise<void>
  getOutput(): Output
  failed?: boolean
  error?: string | null
}

export type SolverConstructor<Input, Output> = {
  new (input: Input): RuntimeSolver<Output>
  readonly solverName: string
}

/** Small transport boundary; no platform imports in the default entrypoint. */
export interface SolverMessageEndpoint {
  postMessage(message: unknown): void
  onMessage(listener: (message: unknown) => void): () => void
}

export interface SolverWorker extends SolverMessageEndpoint {
  /** Includes unexpected exits, even exits with code zero. */
  onError(listener: (error: Error) => void): () => void
  terminate(): void | Promise<unknown>
}

export interface SolverRuntimeOptions {
  createWorker?: () => SolverWorker
  workerCount?: number
  startupTimeoutMs?: number
  /** CI can require remote execution so serial execution cannot mask packaging errors. */
  requireWorker?: boolean
  /** Only startup failures may select serial execution; execution failures always reject. */
  startupFailure?: "throw" | "serial"
  onDiagnostic?: (error: Error) => void
}

export type ThreadedSolverRuntimeOptions = Omit<
  SolverRuntimeOptions,
  "createWorker"
> & { workerCount: number } & (
    | { workerSource: string; workerUrl?: never }
    | { workerUrl: URL; workerSource?: never }
  )
