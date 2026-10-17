import { SolverRuntime } from "../../lib/runtime/bun"
import "./runtimeSolvers"

globalThis.solverRuntimeTestWorker = true
SolverRuntime.listen()
