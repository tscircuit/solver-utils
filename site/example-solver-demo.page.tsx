import React from "react"
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
  const solver = new ExampleSolver()

  return (
    <div style={{ padding: "20px" }}>
      <h1>Generic Solver Debugger Demo</h1>
      <p>
        This page demonstrates the <code>GenericSolverDebugger</code> component with a simple
        optimization solver. The solver tries to find the optimal position that minimizes
        the total distance to all target points (shown in red).
      </p>

      <div style={{ marginTop: "20px", border: "1px solid #ccc", borderRadius: "8px" }}>
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
      </div>

      <div style={{ marginTop: "20px", fontSize: "14px", color: "#666" }}>
        <h3>Instructions:</h3>
        <ul>
          <li><strong>Step:</strong> Execute one iteration of the solver</li>
          <li><strong>Solve:</strong> Run the solver to completion</li>
          <li><strong>Animate:</strong> Watch the solver run with visual feedback</li>
        </ul>

        <h3>Visualization:</h3>
        <ul>
          <li><span style={{ color: "red" }}>Red points:</span> Target locations</li>
          <li><span style={{ color: "blue" }}>Blue point:</span> Current solver position</li>
          <li><span style={{ color: "orange" }}>Orange point:</span> Best position found so far</li>
          <li><span style={{ color: "gray", opacity: 0.6 }}>Gray lines:</span> Distances being minimized</li>
        </ul>
      </div>
    </div>
  )
}