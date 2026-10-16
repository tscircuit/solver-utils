import { parentPort } from "node:worker_threads"

if (!parentPort) throw new Error("Fixture requires a worker")
const port = parentPort
port.on("message", (message: { id: number; input: { mode: string } }): void => {
  switch (message.input.mode) {
    case "version":
      port.postMessage({
        type: "result",
        protocolVersion: 2,
        id: message.id,
        output: 1,
      })
      break
    case "unknown-id":
      port.postMessage({
        type: "result",
        protocolVersion: 1,
        id: message.id + 1,
        output: 1,
      })
      break
    case "missing-output":
      port.postMessage({ type: "result", protocolVersion: 1, id: message.id })
      break
    case "malformed-error":
      port.postMessage({
        type: "error",
        protocolVersion: 1,
        id: message.id,
        error: { name: 1, message: "bad" },
      })
      break
    case "duplicate-ready":
      port.postMessage({ type: "ready", protocolVersion: 1 })
      break
    case "exit":
      process.exit(9)
  }
})
port.postMessage({ type: "ready", protocolVersion: 1 })
