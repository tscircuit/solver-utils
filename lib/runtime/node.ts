import { parentPort, Worker, type MessagePort } from "node:worker_threads"
import { assertBunWorkerSupport } from "./assertBunWorkerSupport"
import { SolverRuntime as InlineSolverRuntime } from "./SolverRuntime"
import type {
  AnySolverCatalog,
  SolverMessageEndpoint,
  SolverRuntimeCatalog,
  SolverWorker,
  ThreadedSolverRuntimeOptions,
} from "./types"

function nodeEndpoint(port: MessagePort | Worker): SolverMessageEndpoint {
  return {
    postMessage: (message): void => port.postMessage(message, []),
    onMessage: (listener): (() => void) => {
      port.on("message", listener)
      return (): void => {
        port.off("message", listener)
      }
    },
  }
}

export class SolverRuntime<
  Tasks extends SolverRuntimeCatalog<Tasks> = AnySolverCatalog,
> extends InlineSolverRuntime<Tasks> {
  constructor(options: ThreadedSolverRuntimeOptions) {
    super({
      ...options,
      createWorker: (): SolverWorker => {
        assertBunWorkerSupport()
        const worker = options.workerUrl
          ? new Worker(options.workerUrl)
          : new Worker(options.workerSource, { eval: true })
        let exited = false
        return {
          ...nodeEndpoint(worker),
          onError: (listener): (() => void) => {
            const exit = (code: number): void => {
              exited = true
              listener(new Error("Solver worker exited unexpectedly: " + code))
            }
            const messageError = (): void =>
              listener(new Error("Could not deserialize solver worker message"))
            worker.on("error", listener)
            worker.on("exit", exit)
            worker.on("messageerror", messageError)
            return (): void => {
              worker.off("error", listener)
              worker.off("exit", exit)
              worker.off("messageerror", messageError)
            }
          },
          terminate: (): Promise<number> =>
            exited ? Promise.resolve(0) : worker.terminate(),
        }
      },
    })
  }

  static override listen(endpoint?: SolverMessageEndpoint): () => void {
    if (endpoint) return InlineSolverRuntime.listen(endpoint)
    if (!parentPort)
      throw new Error("SolverRuntime.listen() requires a Node worker")
    return InlineSolverRuntime.listen(nodeEndpoint(parentPort))
  }
}
