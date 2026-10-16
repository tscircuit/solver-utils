/** Avoid treating browser process shims as a native Node-compatible runtime. */
export function isNodeRuntime(): boolean {
  const runtime = globalThis as {
    process?: { versions?: { node?: unknown }; release?: { name?: unknown } }
  }
  return (
    typeof runtime.process?.versions?.node === "string" &&
    runtime.process.release?.name === "node"
  )
}
