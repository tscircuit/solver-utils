/** Await normally: Bun's promise matchers can run a nested native event loop. */
export async function getRejectedError(
  pending: Promise<unknown>,
): Promise<Error> {
  try {
    await pending
  } catch (error) {
    if (error instanceof Error) return error
    throw error
  }
  throw new Error("Expected execution to reject")
}
