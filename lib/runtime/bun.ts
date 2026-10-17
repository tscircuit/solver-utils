import { assertBunWorkerSupport } from "./assertBunWorkerSupport"
import { SolverRuntime as InlineSolverRuntime } from "./SolverRuntime"
import type {
  AnySolverCatalog,
  SolverRuntimeCatalog,
  SolverWorker,
  ThreadedSolverRuntimeOptions,
} from "./types"
import { wrapWebWorker } from "./webWorkerEndpoint"

/** Bun's native Web Worker API. Source must be a self-contained module bundle. */
export class SolverRuntime<
  Tasks extends SolverRuntimeCatalog<Tasks> = AnySolverCatalog,
> extends InlineSolverRuntime<Tasks> {
  constructor(options: ThreadedSolverRuntimeOptions) {
    super({
      ...options,
      createWorker: (): SolverWorker => {
        assertBunWorkerSupport()
        const url =
          options.workerUrl ??
          URL.createObjectURL(
            new Blob([options.workerSource], {
              type: "application/javascript",
            }),
          )
        let worker: Worker
        try {
          worker = new Worker(url, { type: "module" })
        } catch (error) {
          if (!options.workerUrl) URL.revokeObjectURL(url.toString())
          throw error
        }
        const wrapped = wrapWebWorker(worker)
        return {
          ...wrapped,
          terminate: (): void => {
            worker.terminate()
            if (!options.workerUrl) URL.revokeObjectURL(url.toString())
          },
        }
      },
    })
  }
}
