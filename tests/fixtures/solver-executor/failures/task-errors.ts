import { runSolverWorker, type SolverTaskDefinition } from "../../../../lib"

type Tasks = {
  probe: SolverTaskDefinition<{ mode: string; value?: number }, unknown>
}

await runSolverWorker<Tasks>({
  probe(input) {
    if (input.mode === "throw") throw new TypeError("Task failed deliberately")
    if (input.mode === "uncloneable-output") return () => 1
    if (input.mode === "circular-error") {
      const error = new Error("Circular error cause")
      error.cause = error
      throw error
    }
    return input.value ?? 42
  },
})
