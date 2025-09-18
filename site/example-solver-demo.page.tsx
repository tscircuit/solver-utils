import React, { useMemo } from "react"
import { GenericSolverDebugger } from "../lib/react/GenericSolverDebugger"
import { ExampleSolver } from "./ExampleSolver"

/**
 * Demonstration page for the GenericSolverDebugger component.
 *
 * This page shows how to use the GenericSolverDebugger with a simple
 * optimization solver that finds the optimal position to minimize
 * distance to a set of target points.
 */
export default function ExampleSolverDemo() {
  // Create a new instance of our example solver
  const solver = useMemo(() => new ExampleSolver(), [])

  return (
    <GenericSolverDebugger
      solver={solver}
      animationSpeed={50}
      onSolverStarted={(solver) => {
        console.log("Solver started:", solver)
      }}
      onSolverCompleted={(solver) => {
        console.log("Solver completed:", solver)
        console.log("Final stats:", solver.stats)
      }}
    />
  )
}
