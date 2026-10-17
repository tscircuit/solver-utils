import {
  BaseSolver,
  SolverRuntime,
  type SolverRuntimeExecutor,
} from "../../lib"

type Tasks = {
  Sum: { input: { values: number[] }; output: number }
}

class Sum extends BaseSolver {
  static readonly solverName = "Sum"
  constructor(private input: { values: number[] }) {
    super()
  }
  override getOutput(): number {
    return this.input.values.reduce((a, b) => a + b, 0)
  }
}
SolverRuntime.registerSolver(Sum)

async function checkRuntimeTypes(
  runtime: SolverRuntimeExecutor<Tasks>,
  concrete: SolverRuntime,
): Promise<void> {
  const byName: number = await runtime.executeAsync("Sum", { values: [1, 2] })
  const byClass: number = await runtime.executeAsync(Sum, { values: [1, 2] })
  const inferred: number = await concrete.executeAsync(Sum, { values: [1, 2] })
  // @ts-expect-error named task input is checked
  await runtime.executeAsync("Sum", { values: ["bad"] })
  // @ts-expect-error class constructor input is checked
  await runtime.executeAsync(Sum, { values: ["bad"] })
  // @ts-expect-error class constructor input is checked without a catalog
  await concrete.executeAsync(Sum, { values: ["bad"] })
  // @ts-expect-error unknown task names are checked
  await runtime.executeAsync("missing", {})
  // @ts-expect-error named result type is checked
  const wrongName: string = await runtime.executeAsync("Sum", { values: [] })
  // @ts-expect-error class output type is inferred from getOutput
  const wrongClass: string = await concrete.executeAsync(Sum, { values: [] })
  class Unnamed extends BaseSolver {}
  // @ts-expect-error registration requires a static solverName
  SolverRuntime.registerSolver(Unnamed)
  // @ts-expect-error class invocation requires a static solverName
  await concrete.executeAsync(Unnamed, {})
  void [byName, byClass, inferred, wrongName, wrongClass]
}
void checkRuntimeTypes
