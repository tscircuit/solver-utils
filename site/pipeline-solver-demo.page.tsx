import React from "react"
import { GenericSolverDebugger } from "../lib/react/GenericSolverDebugger"
import { ExamplePipelineSolver } from "./ExamplePipelineSolver"

/**
 * Demonstration page for the GenericSolverDebugger component with a pipeline solver.
 *
 * This page shows how to use the GenericSolverDebugger with a multi-stage
 * pipeline solver that demonstrates staged optimization.
 */
export default function PipelineSolverDemo() {
  // Create a new instance of our example pipeline solver
  const solver = new ExamplePipelineSolver({
    targetX: 12,
    targetY: -8,
    initialX: -15,
    initialY: 20,
  })

  return (
    <div style={{ padding: "20px" }}>
      <h1>Pipeline Solver Debugger Demo</h1>
      <p>
        This page demonstrates the <code>GenericSolverDebugger</code> component with a multi-stage
        pipeline solver. The solver runs in two phases:
      </p>

      <ol>
        <li><strong>Coarse Positioning:</strong> Uses large steps to get close to the target</li>
        <li><strong>Fine Positioning:</strong> Uses small steps for precise positioning</li>
      </ol>

      <div style={{ marginTop: "20px", border: "1px solid #ccc", borderRadius: "8px" }}>
        <GenericSolverDebugger
          solver={solver}
          animationSpeed={100}
          onSolverStarted={(solver) => {
            console.log("Pipeline solver started:", solver)
          }}
          onSolverCompleted={(solver) => {
            console.log("Pipeline solver completed:", solver)
            console.log("Phase statistics:", (solver as any).getPhaseStats())
          }}
        />
      </div>

      <div style={{ marginTop: "20px", fontSize: "14px", color: "#666" }}>
        <h3>Pipeline Features:</h3>
        <ul>
          <li><strong>Next Stage:</strong> Complete the current phase and move to the next</li>
          <li><strong>Phase Indicator:</strong> Shows which phase is currently active</li>
          <li><strong>Automatic Progression:</strong> Phases automatically advance when completed</li>
        </ul>

        <h3>Visualization:</h3>
        <ul>
          <li><span style={{ color: "red" }}>Red point:</span> Target location</li>
          <li><span style={{ color: "blue" }}>Blue point/line:</span> Phase 1 - Coarse positioning</li>
          <li><span style={{ color: "green" }}>Green point/line:</span> Phase 2 - Fine positioning</li>
        </ul>

        <h3>Implementation Notes:</h3>
        <ul>
          <li>Each phase is a separate solver with its own visualization</li>
          <li>The pipeline manages the transition between phases</li>
          <li>Phase 2 receives the result from Phase 1 as input</li>
          <li>Statistics are tracked per phase for performance analysis</li>
        </ul>
      </div>
    </div>
  )
}