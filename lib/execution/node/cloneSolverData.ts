import { MessageChannel } from "node:worker_threads"

/**
 * Use the same structured-clone transport as native workers. In particular,
 * SharedArrayBuffers and views over them retain their shared backing storage.
 */
export function cloneSolverData<Value>(value: Value): Promise<Value> {
  return new Promise((resolve, reject) => {
    const { port1, port2 } = new MessageChannel()
    const close = () => {
      port1.close()
      port2.close()
    }

    port2.once("message", (cloned: Value) => {
      close()
      resolve(cloned)
    })
    port2.once("messageerror", (error) => {
      close()
      reject(error)
    })

    try {
      port1.postMessage(value)
    } catch (error) {
      close()
      reject(error)
    }
  })
}
