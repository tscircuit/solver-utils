/** Older Bun releases can hang or crash during worker cleanup. */
export function assertBunWorkerSupport(): void {
  if (
    typeof Bun !== "undefined" &&
    !Bun.semver.satisfies(Bun.version, ">=1.4.2")
  ) {
    throw new Error(
      "Threaded SolverRuntime requires Bun >=1.4.2; upgrade Bun or use the inline runtime",
    )
  }
}
