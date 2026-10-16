import { parentPort } from "node:worker_threads"

if (!parentPort) throw new Error("Fixture requires a worker")
parentPort.postMessage({ type: "result", protocolVersion: 1, id: 0, output: 1 })
parentPort.on("message", () => {})
