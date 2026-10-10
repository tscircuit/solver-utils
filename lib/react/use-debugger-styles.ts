import { useEffect } from "react"
import styles from "./debugger-styles.generated"

export const useDebuggerStyles = () => {
  useEffect(() => {
    if (typeof document === "undefined") return
    if (
      document.querySelector('style[data-styles="tscircuit-solver-debugger"]')
    ) {
      return
    }
    const style = document.createElement("style")
    style.setAttribute("data-styles", "tscircuit-solver-debugger")
    style.textContent = styles
    document.head.appendChild(style)
  }, [])
}
