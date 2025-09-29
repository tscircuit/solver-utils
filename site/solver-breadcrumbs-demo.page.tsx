import React, { useMemo } from "react"
import { GenericSolverDebugger } from "../lib/react/GenericSolverDebugger"
import { BaseSolver } from "../lib/BaseSolver"
import type { GraphicsObject } from "graphics-debug"

class LeafSolver extends BaseSolver {
  constructor(private params: { name: string; dataset: { items: number[] } }) {
    super()
  }

  override _step() {
    this.solved = true
  }

  override getConstructorParams() {
    return [this.params]
  }

  override visualize(): GraphicsObject {
    return {
      points: this.params.dataset.items.map((x, i) => ({
        x,
        y: i,
        color: "orange",
        label: `pt${i}`,
      })),
      lines: [],
      rects: [],
      circles: [],
      texts: [
        { x: -10, y: 10, text: "Leaf Solver", color: "orange", fontSize: 12 },
      ],
    }
  }
}

class MidSolver extends BaseSolver {
  constructor(private params: { threshold: number }) {
    super()
  }

  override _setup() {
    this.activeSubSolver = new LeafSolver({
      name: "leaf",
      dataset: { items: [1, 2, 3, 4, 5] },
    })
  }

  override _step() {
    if (this.activeSubSolver && this.activeSubSolver.solved) {
      this.solved = true
    } else {
      this.activeSubSolver?.step()
    }
  }

  override getConstructorParams() {
    return [this.params]
  }

  override visualize(): GraphicsObject {
    return {
      points: [
        { x: this.params.threshold, y: 0, color: "green", label: "thr" },
      ],
      lines: [],
      rects: [],
      circles: [],
      texts: [
        { x: -10, y: 12, text: "Mid Solver", color: "green", fontSize: 12 },
      ],
    }
  }
}

class RootSolver extends BaseSolver {
  constructor(private params: { scenario: string }) {
    super()
  }

  override _setup() {
    this.activeSubSolver = new MidSolver({ threshold: 5 })
  }

  override _step() {
    if (this.activeSubSolver && this.activeSubSolver.solved) {
      this.solved = true
    } else {
      this.activeSubSolver?.step()
    }
  }

  override getConstructorParams() {
    return [this.params]
  }

  override visualize(): GraphicsObject {
    return {
      points: [{ x: 0, y: 0, color: "blue", label: "root" }],
      lines: [],
      rects: [],
      circles: [],
      texts: [
        { x: -10, y: 14, text: "Root Solver", color: "blue", fontSize: 12 },
      ],
    }
  }
}

/**
 * Demo page to preview the SolverBreadcrumbInputDownloader in React Cosmos.
 * Use the dropdowns on each breadcrumb to download JSON for each solver in the chain.
 */
export default function SolverBreadcrumbsDemo() {
  const solver = useMemo(() => {
    const s = new RootSolver({ scenario: "Demo chain" })
    // Ensure nested solvers are created so breadcrumbs show the full chain
    s.setup()
    return s
  }, [])

  return (
    <GenericSolverDebugger
      solver={solver}
      animationSpeed={100}
      onSolverStarted={(solver) => {
        console.log("Breadcrumb demo solver started:", solver)
      }}
      onSolverCompleted={(solver) => {
        console.log("Breadcrumb demo solver completed:", solver)
      }}
    />
  )
}
