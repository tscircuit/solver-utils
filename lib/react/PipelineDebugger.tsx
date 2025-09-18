import React, { useRef } from "react"
import type { BasePipelineSolver } from "../BasePipelineSolver"
import type { BaseSolver } from "../BaseSolver"
import { GenericSolverDebugger } from "./GenericSolverDebugger"
import { PipelineStageTable } from "./PipelineStageTable"

interface PipelineDebuggerBaseProps<TSolver extends BasePipelineSolver<any>> {
  animationSpeed?: number
  onSolverStarted?: (solver: TSolver) => void
  onSolverCompleted?: (solver: TSolver) => void
}

interface PipelineDebuggerWithSolver<TSolver extends BasePipelineSolver<any>>
  extends PipelineDebuggerBaseProps<TSolver> {
  solver: TSolver
}

interface PipelineDebuggerWithFactory<
  TInput,
  TSolver extends BasePipelineSolver<TInput>,
> extends PipelineDebuggerBaseProps<TSolver> {
  inputProblem: TInput
  createSolver: (input: TInput) => TSolver
}

export type PipelineDebuggerProps<
  TInput,
  TSolver extends BasePipelineSolver<TInput>,
> = PipelineDebuggerWithSolver<TSolver> | PipelineDebuggerWithFactory<TInput, TSolver>

const usePipelineSolverInstance = <
  TInput,
  TSolver extends BasePipelineSolver<TInput>,
>(props: PipelineDebuggerProps<TInput, TSolver>): TSolver => {
  const solverRef = useRef<TSolver | null>(null)
  const lastInputRef = useRef<TInput | null>(null)
  const lastFactoryRef = useRef<((input: TInput) => TSolver) | null>(null)

  if ("solver" in props) {
    if (solverRef.current !== props.solver) {
      solverRef.current = props.solver
    }
  } else {
    if (
      !solverRef.current ||
      lastInputRef.current !== props.inputProblem ||
      lastFactoryRef.current !== props.createSolver
    ) {
      solverRef.current = props.createSolver(props.inputProblem)
      lastInputRef.current = props.inputProblem
      lastFactoryRef.current = props.createSolver
    }
  }

  if (!solverRef.current) {
    throw new Error("PipelineDebugger failed to initialize a solver instance")
  }

  return solverRef.current
}

export const PipelineDebugger = <
  TInput,
  TSolver extends BasePipelineSolver<TInput>,
>(
  props: PipelineDebuggerProps<TInput, TSolver>,
) => {
  const solver = usePipelineSolverInstance(props)

  const { animationSpeed, onSolverStarted, onSolverCompleted } = props

  const handleSolverStarted = onSolverStarted
    ? (baseSolver: BaseSolver) => onSolverStarted(baseSolver as TSolver)
    : undefined

  const handleSolverCompleted = onSolverCompleted
    ? (baseSolver: BaseSolver) => onSolverCompleted(baseSolver as TSolver)
    : undefined

  return (
    <GenericSolverDebugger
      solver={solver}
      animationSpeed={animationSpeed}
      onSolverStarted={handleSolverStarted}
      onSolverCompleted={handleSolverCompleted}
      renderBelowVisualizer={({ triggerRender }) => (
        <PipelineStageTable
          pipelineSolver={solver}
          triggerRender={triggerRender}
        />
      )}
    />
  )
}
