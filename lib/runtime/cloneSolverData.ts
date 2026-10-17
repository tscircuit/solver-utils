/**
 * Native messaging gives inline execution the same isolation as workers.
 * In particular, Bun 1.3.2 structuredClone copies SABs into ordinary buffers;
 * MessageChannel preserves their shared backing storage and graph aliases.
 */
export function cloneSolverData<T>(value: T): Promise<T> {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel()
    const close = (): void => {
      channel.port1.close()
      channel.port2.close()
    }
    channel.port2.onmessage = (event): void => {
      close()
      resolve(event.data as T)
    }
    channel.port2.onmessageerror = (): void => {
      close()
      reject(new Error("Could not deserialize solver data"))
    }
    try {
      channel.port1.postMessage(value)
    } catch (error) {
      close()
      reject(error)
    }
  })
}
