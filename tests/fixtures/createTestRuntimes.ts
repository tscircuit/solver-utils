import { SolverRuntime } from "../../lib"
import { SolverRuntime as BunSolverRuntime } from "../../lib/runtime/bun"
import { SolverRuntime as NodeSolverRuntime } from "../../lib/runtime/node"

export function createTestRuntimes(): SolverRuntime[] {
  return [
    new SolverRuntime(),
    new NodeSolverRuntime({
      workerUrl: new URL("./runtimeNodeWorker.ts", import.meta.url),
      workerCount: 2,
      requireWorker: true,
    }),
    new BunSolverRuntime({
      workerUrl: new URL("./runtimeBunWorker.ts", import.meta.url),
      workerCount: 2,
      requireWorker: true,
    }),
  ]
}
