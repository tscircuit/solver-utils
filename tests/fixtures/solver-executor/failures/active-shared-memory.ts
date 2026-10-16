import { parentPort } from "node:worker_threads"

if (!parentPort) throw new Error("Fixture requires a worker")
const port = parentPort
port.on(
  "message",
  (message: {
    id: number
    input: { mode: string }
    context: { shared: SharedArrayBuffer }
  }): void => {
    const control = new Int32Array(message.context.shared)
    if (message.input.mode === "increment") {
      Atomics.store(control, 0, 1)
      Atomics.notify(control, 0)
      setInterval(() => Atomics.add(control, 1, 1), 0)
      return
    }
    while (Atomics.load(control, 0) === 0) Atomics.wait(control, 0, 0, 2_000)
    throw new Error("Crash while another worker owns shared input")
  },
)
port.postMessage({ type: "ready", protocolVersion: 1 })
