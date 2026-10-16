type NodeWorkerThreads = typeof import("node:worker_threads")

let loaded: Promise<NodeWorkerThreads> | undefined

/** Keep native runtime imports out of the portable module graph. */
export function loadNodeWorkerThreads(): Promise<NodeWorkerThreads> {
  const nodeModuleName = "node:worker_threads"
  loaded ??= import(
    /* @vite-ignore */ /* webpackIgnore: true */ nodeModuleName
  ) as Promise<NodeWorkerThreads>
  return loaded
}
