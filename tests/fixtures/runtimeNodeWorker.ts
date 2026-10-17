import { SolverRuntime } from "../../lib/runtime/node"
import "./runtimeSolvers"

globalThis.solverRuntimeTestWorker = true
SolverRuntime.listen()
