import type { SolverTaskCatalog, SolverTaskContext } from "./SolverExecutor"

/** Handlers are registered locally; only their task kind and data cross workers. */
export type SolverTaskHandlers<Tasks extends SolverTaskCatalog<Tasks>> = {
  [Kind in keyof Tasks]: (
    input: Tasks[Kind]["input"],
    context: SolverTaskContext<Tasks[Kind]["shared"]>,
  ) => Tasks[Kind]["output"] | Promise<Tasks[Kind]["output"]>
}
