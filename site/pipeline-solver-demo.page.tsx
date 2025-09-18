import React, { useMemo } from "react"
import { PipelineDebugger } from "../lib/react/PipelineDebugger"
import { ExamplePipelineSolver } from "./ExamplePipelineSolver"

/**
 * Demonstration page for the GenericSolverDebugger component with a pipeline solver.
 *
 * This page shows how to use the GenericSolverDebugger with a multi-stage
 * pipeline solver that demonstrates staged optimization.
 */
export default function PipelineSolverDemo() {
  // Create a new instance of our example pipeline solver
  const solver = useMemo(
    () =>
      new ExamplePipelineSolver({
        targetX: 12,
        targetY: -8,
        initialX: -15,
        initialY: 20,
      }),
    [],
  )

  return (
    <PipelineDebugger
      solver={solver}
      animationSpeed={100}
      onSolverStarted={(solver) => {
        console.log("Pipeline solver started:", solver)
      }}
      onSolverCompleted={(solver) => {
        console.log("Pipeline solver completed:", solver)
        if (solver instanceof ExamplePipelineSolver) {
          console.log("Phase statistics:", solver.getPhaseStats())
        }
      }}
    />
  )
}
