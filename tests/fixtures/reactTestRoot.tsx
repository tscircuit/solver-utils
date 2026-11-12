import { act, type ReactNode } from "react"
import { createRoot, type Root } from "react-dom/client"
import { Window } from "happy-dom"

let cleanup: (() => Promise<void>) | undefined

export async function cleanupReactRoot() {
  await cleanup?.()
  cleanup = undefined
}

export async function mount(element: ReactNode) {
  const window = new Window({ url: "http://localhost" })
  const globals = {
    window,
    document: window.document,
    HTMLElement: window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  }
  const previous = Object.fromEntries(
    Object.keys(globals).map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  )
  Object.assign(globalThis, globals)
  const container = window.document.createElement("div")
  window.document.body.appendChild(container)
  let root: Root
  await act(() => {
    root = createRoot(container as unknown as HTMLElement)
    root.render(element)
  })
  cleanup = async () => {
    await act(() => root.unmount())
    await window.happyDOM.close()
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor)
      else Reflect.deleteProperty(globalThis, key)
    }
  }
  return {
    container,
    window,
    button: (text: string) => {
      const button = [...container.querySelectorAll("button")].find(
        (button) => button.textContent?.trim() === text,
      )
      if (!button) throw new Error(`Button not found: ${text}`)
      return button
    },
    click: async (text: string) => {
      const button = [...container.querySelectorAll("button")].find(
        (button) => button.textContent?.trim() === text,
      )
      if (!button) throw new Error(`Button not found: ${text}`)
      await act(() => button.click())
    },
  }
}

export async function waitFor(predicate: () => boolean) {
  const deadline = Date.now() + 1000
  while (!predicate()) {
    if (Date.now() > deadline)
      throw new Error("Timed out waiting for React update")
    await act(async () => {
      await Bun.sleep(1)
    })
  }
}
