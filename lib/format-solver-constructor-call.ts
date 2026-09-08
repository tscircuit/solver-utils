/**
 * `getConstructorParams()` returns either a tuple of constructor arguments or
 * a legacy single-object value. Download templates must unpack tuples.
 */
export function getConstructorArgumentList(params: unknown): unknown[] {
  return Array.isArray(params) ? params : [params]
}

export function formatNewSolverExpression(solverName: string): string {
  return `new ${solverName}(...(Array.isArray(input) ? input : [input]) as any)`
}
