import { parentPort } from "node:worker_threads"

if (!parentPort) throw new Error("Fixture requires a worker")
parentPort.on("message", () => {})
