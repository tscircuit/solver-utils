import { createContext, useContext, useEffect, useRef, useState } from "react"
import type { BaseSolver } from "../BaseSolver"

type SolverActions = {
  isRunning: boolean
  actionError: string | null
  run: (action: (step: () => Promise<void>) => Promise<void>) => Promise<void>
}

export const SolverActionsContext = createContext<SolverActions | null>(null)

/** Shared by all debugger controls; standalone controls get their own guard. */
export function useSolverActions(
  solver: BaseSolver,
  triggerRender?: () => void,
): SolverActions {
  const shared = useContext(SolverActionsContext)
  const busy = useRef(false)
  const mounted = useRef(true)
  const [isRunning, setIsRunning] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const run: SolverActions["run"] = async (action) => {
    if (busy.current || !mounted.current || solver.solved || solver.failed)
      return
    busy.current = true
    setIsRunning(true)
    setActionError(null)
    let lastYield = Date.now()
    try {
      await action(async () => {
        if (!mounted.current) throw new Error("Debugger unmounted")
        const pending = solver.stepAsync()
        triggerRender?.()
        try {
          await pending
        } finally {
          if (mounted.current) triggerRender?.()
        }
        if (Date.now() - lastYield >= 16) {
          await new Promise((resolve) => setTimeout(resolve, 0))
          lastYield = Date.now()
        }
      })
    } catch (error) {
      if (mounted.current) setActionError(String(error))
    } finally {
      busy.current = false
      if (mounted.current) {
        setIsRunning(false)
        triggerRender?.()
      }
    }
  }

  return shared ?? { isRunning, actionError, run }
}
