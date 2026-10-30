import { expect, test } from "bun:test"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { BaseSolver } from "../lib/BaseSolver"
import { GenericSolverDebugger } from "../lib/react/GenericSolverDebugger"

test("a custom renderer uses standard controls without evaluating the 2D visualization", () => {
  class MeshSolver extends BaseSolver {
    override visualize(): never {
      throw new Error("This solver has 3D graphics")
    }
    override getConstructorParams() {
      return []
    }
    override _step() {
      this.solved = true
    }
  }
  const solver = new MeshSolver()
  const render = () =>
    renderToStaticMarkup(
      <GenericSolverDebugger
        solver={solver}
        customRenderer={{
          name: "3D",
          render: (current) => <div>Mesh frame {current.iterations}</div>,
          getDownload: () => ({ meshes: [] }),
        }}
      />,
    )
  expect(render()).toContain("Mesh frame 0")
  expect(render()).toContain("Step")
  expect(render()).not.toContain("No Graphics Yet")
  expect(render()).not.toContain(">Renderer<")
  solver.step()
  expect(render()).toContain("Mesh frame 1")
})
