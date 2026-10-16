import { threadId } from "node:worker_threads"
import type { SolverTaskDefinition } from "../../../lib/execution/SolverExecutor"
import type { SolverTaskHandlers } from "../../../lib/execution/SolverTaskHandlers"

export type TestTasks = {
  "test/square": SolverTaskDefinition<
    { value: number; delayMs?: number },
    { value: number; threadId: number }
  >
  "test/inspect": SolverTaskDefinition<
    { values: number[] },
    {
      values: number[]
      label: string
      sharedValue: number
      topology: SharedArrayBuffer
      view: Int32Array
    },
    { metadata: { label: string }; topology: SharedArrayBuffer }
  >
  "test/fail": SolverTaskDefinition<
    { mode: "throw" | "reject" | "output" | "primitive" },
    unknown
  >
  "test/gate": SolverTaskDefinition<
    { slot: 0 | 1; value: number },
    { value: number; threadId: number },
    { control: SharedArrayBuffer }
  >
}

export const handlers: SolverTaskHandlers<TestTasks> = {
  "test/square": async ({ value, delayMs = 0 }) => {
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
    return { value: value * value, threadId }
  },
  "test/inspect": (input, { shared }) => {
    const label = shared.metadata.label
    input.values.push(99)
    shared.metadata.label = "changed"
    return {
      values: input.values,
      label,
      sharedValue: new Int32Array(shared.topology)[0]!,
      topology: shared.topology,
      view: new Int32Array(shared.topology, 4, 1),
    }
  },
  "test/fail": ({ mode }) => {
    switch (mode) {
      case "throw":
        throw new Error("task throw failure")
      case "reject":
        return Promise.reject(new Error("task reject failure"))
      case "output":
        return () => undefined
      case "primitive":
        throw "primitive failure"
    }
  },
  "test/gate": async ({ slot, value }, { shared }) => {
    // Test-only synchronization: each task writes its own started slot, while
    // the test coordinator releases the corresponding gate in slots 2 and 3.
    const control = new Int32Array(shared.control)
    Atomics.store(control, slot, 1)
    while (Atomics.load(control, slot + 2) !== 1) {
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    return { value, threadId }
  },
}
