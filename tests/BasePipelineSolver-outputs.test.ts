import { test, expect } from "bun:test"
import type { GraphicsObject } from "graphics-debug"
import { BaseSolver } from "../lib/BaseSolver"
import { BasePipelineSolver, definePipelineStep } from "../lib/BasePipelineSolver"

// Define specific output types for each solver
interface DataProcessorOutput {
  processedData: number[]
  metadata: { count: number; sum: number }
}

interface ValidatorOutput {
  isValid: boolean
  errors: string[]
  validCount: number
}

interface AggregatorOutput {
  finalResult: number
  statistics: {
    mean: number
    max: number
    min: number
  }
}

interface TestProblem {
  inputData: number[]
  validationRules: {
    minValue: number
    maxValue: number
  }
}

// Solvers with typed outputs
class DataProcessorSolver extends BaseSolver {
  result: DataProcessorOutput

  constructor(private input: TestProblem) {
    super()
    this.result = {
      processedData: [],
      metadata: { count: 0, sum: 0 }
    }
  }

  override _step() {
    // Process input data (multiply by 2)
    const processed = this.input.inputData.map(x => x * 2)
    this.result = {
      processedData: processed,
      metadata: {
        count: processed.length,
        sum: processed.reduce((a, b) => a + b, 0)
      }
    }
    this.solved = true
  }

  override getOutput(): DataProcessorOutput {
    return this.result
  }

  override visualize(): GraphicsObject {
    return {
      points: this.result.processedData.map((value, index) => ({
        x: index,
        y: value,
        label: `Processed: ${value}`
      })),
      lines: [],
      rects: [],
      circles: [],
    }
  }
}

class ValidatorSolver extends BaseSolver {
  result: ValidatorOutput

  constructor(
    private processedData: DataProcessorOutput,
    private rules: TestProblem["validationRules"]
  ) {
    super()
    this.result = {
      isValid: false,
      errors: [],
      validCount: 0
    }
  }

  override _step() {
    const errors: string[] = []
    let validCount = 0

    for (const value of this.processedData.processedData) {
      if (value < this.rules.minValue) {
        errors.push(`Value ${value} below minimum ${this.rules.minValue}`)
      } else if (value > this.rules.maxValue) {
        errors.push(`Value ${value} above maximum ${this.rules.maxValue}`)
      } else {
        validCount++
      }
    }

    this.result = {
      isValid: errors.length === 0,
      errors,
      validCount
    }
    this.solved = true
  }

  override getOutput(): ValidatorOutput {
    return this.result
  }

  override visualize(): GraphicsObject {
    return {
      texts: [{
        x: 0,
        y: 0,
        text: `Valid: ${this.result.validCount}/${this.processedData.processedData.length}`,
        color: this.result.isValid ? "green" : "red"
      }],
      points: [],
      lines: [],
      rects: [],
      circles: [],
    }
  }
}

class AggregatorSolver extends BaseSolver {
  result: AggregatorOutput

  constructor(
    private processedData: DataProcessorOutput,
    private validationResult: ValidatorOutput
  ) {
    super()
    this.result = {
      finalResult: 0,
      statistics: { mean: 0, max: 0, min: 0 }
    }
  }

  override _step() {
    const data = this.processedData.processedData
    const sum = data.reduce((a, b) => a + b, 0)
    const mean = sum / data.length
    const max = Math.max(...data)
    const min = Math.min(...data)

    // Final result incorporates validation score
    const validationScore = this.validationResult.validCount / data.length
    const finalResult = sum * validationScore

    this.result = {
      finalResult,
      statistics: { mean, max, min }
    }
    this.solved = true
  }

  override getOutput(): AggregatorOutput {
    return this.result
  }

  override visualize(): GraphicsObject {
    return {
      texts: [{
        x: 0,
        y: 1,
        text: `Final: ${this.result.finalResult.toFixed(2)}`,
        color: "blue"
      }],
      points: [],
      lines: [],
      rects: [],
      circles: [],
    }
  }
}

// Pipeline solver with typed intermediate outputs
class TypedOutputPipelineSolver extends BasePipelineSolver<TestProblem> {
  dataProcessorSolver?: DataProcessorSolver
  validatorSolver?: ValidatorSolver
  aggregatorSolver?: AggregatorSolver

  pipelineDef = [
    definePipelineStep(
      "dataProcessorSolver",
      DataProcessorSolver,
      (instance) => [instance.inputProblem],
      {
        onSolved: () => {
          console.log("Data processing completed")
        },
      },
    ),
    definePipelineStep(
      "validatorSolver",
      ValidatorSolver,
      (instance) => [
        instance.getStepOutput<DataProcessorOutput>("dataProcessorSolver")!,
        instance.inputProblem.validationRules
      ],
      {
        onSolved: (instance) => {
          const validation = instance.getStepOutput<ValidatorOutput>("validatorSolver")!
          console.log(`Validation completed: ${validation.isValid ? "PASS" : "FAIL"}`)
        },
      },
    ),
    definePipelineStep(
      "aggregatorSolver",
      AggregatorSolver,
      (instance) => [
        instance.getStepOutput<DataProcessorOutput>("dataProcessorSolver")!,
        instance.getStepOutput<ValidatorOutput>("validatorSolver")!
      ],
      {
        onSolved: (instance) => {
          const result = instance.getStepOutput<AggregatorOutput>("aggregatorSolver")!
          console.log(`Final result: ${result.finalResult}`)
        },
      },
    ),
  ]

  override getConstructorParams() {
    return [this.inputProblem]
  }

  // Type-safe output accessors
  getProcessorOutput(): DataProcessorOutput | undefined {
    return this.getStepOutput<DataProcessorOutput>("dataProcessorSolver")
  }

  getValidationOutput(): ValidatorOutput | undefined {
    return this.getStepOutput<ValidatorOutput>("validatorSolver")
  }

  getFinalOutput(): AggregatorOutput | undefined {
    return this.getStepOutput<AggregatorOutput>("aggregatorSolver")
  }
}

test("BasePipelineSolver typed outputs - basic functionality", () => {
  const problem: TestProblem = {
    inputData: [1, 2, 3, 4, 5],
    validationRules: {
      minValue: 0,
      maxValue: 20
    }
  }

  const pipeline = new TypedOutputPipelineSolver(problem)

  // Initially no outputs
  expect(pipeline.hasStepOutput("dataProcessorSolver")).toBe(false)
  expect(pipeline.getProcessorOutput()).toBeUndefined()
  expect(Object.keys(pipeline.getAllOutputs())).toHaveLength(0)
})

test("BasePipelineSolver typed outputs - step by step execution", () => {
  const problem: TestProblem = {
    inputData: [1, 2, 3, 4, 5],
    validationRules: {
      minValue: 0,
      maxValue: 20
    }
  }

  const pipeline = new TypedOutputPipelineSolver(problem)

  // Solve first step
  pipeline.solveUntilPhase("validatorSolver")

  // First step should have output
  expect(pipeline.hasStepOutput("dataProcessorSolver")).toBe(true)
  const processorOutput = pipeline.getProcessorOutput()
  expect(processorOutput).toBeDefined()
  expect(processorOutput!.processedData).toEqual([2, 4, 6, 8, 10])
  expect(processorOutput!.metadata.count).toBe(5)
  expect(processorOutput!.metadata.sum).toBe(30)

  // Second step should not have output yet
  expect(pipeline.hasStepOutput("validatorSolver")).toBe(false)

  // Complete the pipeline
  pipeline.solve()

  // All steps should have outputs
  expect(pipeline.hasStepOutput("dataProcessorSolver")).toBe(true)
  expect(pipeline.hasStepOutput("validatorSolver")).toBe(true)
  expect(pipeline.hasStepOutput("aggregatorSolver")).toBe(true)

  // Validate type-safe accessors
  const validationOutput = pipeline.getValidationOutput()
  expect(validationOutput).toBeDefined()
  expect(validationOutput!.isValid).toBe(true)
  expect(validationOutput!.validCount).toBe(5)
  expect(validationOutput!.errors).toHaveLength(0)

  const finalOutput = pipeline.getFinalOutput()
  expect(finalOutput).toBeDefined()
  expect(finalOutput!.finalResult).toBe(30) // sum * validationScore (1.0)
  expect(finalOutput!.statistics.mean).toBe(6)
  expect(finalOutput!.statistics.max).toBe(10)
  expect(finalOutput!.statistics.min).toBe(2)
})

test("BasePipelineSolver typed outputs - validation failure case", () => {
  const problem: TestProblem = {
    inputData: [1, 2, 10, 4, 5], // 10*2=20 will exceed maxValue
    validationRules: {
      minValue: 0,
      maxValue: 15
    }
  }

  const pipeline = new TypedOutputPipelineSolver(problem)
  pipeline.solve()

  const validationOutput = pipeline.getValidationOutput()!
  expect(validationOutput.isValid).toBe(false)
  expect(validationOutput.validCount).toBe(4) // 4 out of 5 values are valid
  expect(validationOutput.errors).toHaveLength(1)
  expect(validationOutput.errors[0]).toContain("20 above maximum 15")

  const finalOutput = pipeline.getFinalOutput()!
  expect(finalOutput.finalResult).toBe(44 * 0.8) // sum * validationScore (0.8) = 35.2
})

test("BasePipelineSolver typed outputs - getAllOutputs", () => {
  const problem: TestProblem = {
    inputData: [1, 2, 3],
    validationRules: {
      minValue: 0,
      maxValue: 10
    }
  }

  const pipeline = new TypedOutputPipelineSolver(problem)
  pipeline.solve()

  const allOutputs = pipeline.getAllOutputs()
  expect(Object.keys(allOutputs)).toHaveLength(3)
  expect(allOutputs).toHaveProperty("dataProcessorSolver")
  expect(allOutputs).toHaveProperty("validatorSolver")
  expect(allOutputs).toHaveProperty("aggregatorSolver")

  // Verify the outputs are the correct types
  const processorOutput = allOutputs.dataProcessorSolver as DataProcessorOutput
  expect(processorOutput.processedData).toEqual([2, 4, 6])

  const validatorOutput = allOutputs.validatorSolver as ValidatorOutput
  expect(validatorOutput.isValid).toBe(true)

  const aggregatorOutput = allOutputs.aggregatorSolver as AggregatorOutput
  expect(aggregatorOutput.finalResult).toBe(12)
})

test("BasePipelineSolver typed outputs - visualization includes all steps", () => {
  const problem: TestProblem = {
    inputData: [1, 2, 3],
    validationRules: {
      minValue: 0,
      maxValue: 10
    }
  }

  const pipeline = new TypedOutputPipelineSolver(problem)
  pipeline.solve()

  const visualization = pipeline.visualize()

  // Should have points from data processor (step 0)
  const step0Points = visualization.points!.filter(p => p.step === 0)
  expect(step0Points.length).toBe(3)
  expect(step0Points[0].label).toContain("Processed: 2")

  // Should have texts from validator (step 1) and aggregator (step 2)
  const step1Texts = visualization.texts!.filter(t => t.step === 1)
  const step2Texts = visualization.texts!.filter(t => t.step === 2)

  expect(step1Texts.length).toBe(1)
  expect(step1Texts[0].text).toContain("Valid: 3/3")

  expect(step2Texts.length).toBe(1)
  expect(step2Texts[0].text).toContain("Final: 12.00")
})

test("BasePipelineSolver typed outputs - error when accessing getOutput on unsolved solver", () => {
  const problem: TestProblem = {
    inputData: [1, 2, 3],
    validationRules: {
      minValue: 0,
      maxValue: 10
    }
  }

  const pipeline = new TypedOutputPipelineSolver(problem)

  // Step once to create the first solver but don't solve it
  pipeline.step()

  expect(pipeline.hasStepOutput("dataProcessorSolver")).toBe(false)
  expect(pipeline.getProcessorOutput()).toBeUndefined()

  // The solver exists but hasn't completed yet
  expect(pipeline.dataProcessorSolver).toBeDefined()
  expect(pipeline.dataProcessorSolver!.solved).toBe(false)
})