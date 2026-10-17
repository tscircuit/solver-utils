import {
  BaseSolver,
  SolverRuntime,
  type SolverRuntimeExecutor,
} from "../../lib"

type Tasks = {
  sum: { input: { values: number[] }; output: number }
}

class Sum extends BaseSolver {
  constructor(private input: { values: number[] }) {
    super()
  }
  override getOutput(): number {
    return this.input.values.reduce((a, b) => a + b, 0)
  }
}
SolverRuntime.registerSolver("types/sum", Sum)

async function checkRuntimeTypes(
  runtime: SolverRuntimeExecutor<Tasks>,
): Promise<void> {
  const result: number = await runtime.executeAsync("sum", { values: [1, 2] })
  // @ts-expect-error task input is checked
  await runtime.executeAsync("sum", { values: ["bad"] })
  // @ts-expect-error unknown task names are checked
  await runtime.executeAsync("missing", {})
  // @ts-expect-error result type is checked
  const wrong: string = await runtime.executeAsync("sum", { values: [] })
  void result
  void wrong
}
void checkRuntimeTypes
