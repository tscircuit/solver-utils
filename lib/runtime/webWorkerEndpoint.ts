import type { SolverMessageEndpoint, SolverWorker } from "./types"

export function webWorkerEndpoint(
  target: Pick<
    Worker,
    "postMessage" | "addEventListener" | "removeEventListener"
  >,
): SolverMessageEndpoint {
  return {
    postMessage: (message): void => target.postMessage(message),
    onMessage: (listener): (() => void) => {
      const handler = (event: MessageEvent): void => listener(event.data)
      target.addEventListener("message", handler)
      return (): void => target.removeEventListener("message", handler)
    },
  }
}

export function wrapWebWorker(worker: Worker): SolverWorker {
  return {
    ...webWorkerEndpoint(worker),
    onError: (listener): (() => void) => {
      const handler = (event: ErrorEvent): void => {
        event.preventDefault()
        listener(new Error(event.message || "Solver worker failed"))
      }
      const messageError = (): void =>
        listener(new Error("Could not deserialize solver worker message"))
      const close = (): void =>
        listener(new Error("Solver worker exited unexpectedly"))
      worker.addEventListener("error", handler)
      worker.addEventListener("messageerror", messageError)
      worker.addEventListener("close", close)
      return (): void => {
        worker.removeEventListener("error", handler)
        worker.removeEventListener("messageerror", messageError)
        worker.removeEventListener("close", close)
      }
    },
    terminate: (): void => worker.terminate(),
  }
}
