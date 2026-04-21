import { expect, test } from "bun:test"
import { BaseSolver } from "../lib/BaseSolver"
import { SolverWorkerClient, exposeSolverWorker } from "../lib/SolverWorker"

type CountingSolverInput = {
  start: number
  target: number
}

class CountingSolver extends BaseSolver {
  current: number
  target: number
  initialParams: CountingSolverInput

  constructor(params: CountingSolverInput) {
    super()
    this.current = params.start
    this.target = params.target
    this.initialParams = params
  }

  override _step() {
    this.current += 1
    this.stats = { current: this.current }

    if (this.current >= this.target) {
      this.solved = true
    }
  }

  computeProgress() {
    return this.current / this.target
  }

  override getOutput() {
    return { value: this.current }
  }

  override getConstructorParams() {
    return [this.initialParams]
  }

  getDoubleCurrent() {
    return this.current * 2
  }

  override preview() {
    return {
      points: [{ x: this.current, y: 0 }],
      lines: [],
      rects: [],
      circles: [],
    }
  }
}

class ParentSolver extends BaseSolver {
  label = "parent"
  visibleValues = [1, 2, 3]
  _privateValue = "hidden"

  override _setup() {
    this.activeSubSolver = new CountingSolver({ start: 0, target: 1 })
  }
}

function createWorkerHarness() {
  const channel = new MessageChannel()
  const disposeWorker = exposeSolverWorker({
    solverClass: CountingSolver,
    target: channel.port1,
  })
  const client = new SolverWorkerClient(channel.port2)

  return {
    client,
    cleanup() {
      disposeWorker()
      client.terminate()
      channel.port1.close()
      channel.port2.close()
    },
  }
}

test("BaseSolver exposes a serializable snapshot contract", () => {
  const solver = new ParentSolver()
  solver.setup()

  const snapshot = solver.getSerializableSnapshot()

  expect(snapshot.solverName).toBe("ParentSolver")
  expect(snapshot.state).toMatchObject({
    label: "parent",
    visibleValues: [1, 2, 3],
  })
  expect(snapshot.state).not.toHaveProperty("_privateValue")
  expect(snapshot.activeSubSolver?.solverName).toBe("CountingSolver")
})

test("SolverWorkerClient mirrors the common BaseSolver lifecycle asynchronously", async () => {
  const { client, cleanup } = createWorkerHarness()

  try {
    const initSnapshot = await client.init({ start: 0, target: 4 })
    expect(initSnapshot.iterations).toBe(0)
    expect(initSnapshot.state).toMatchObject({
      current: 0,
      target: 4,
    })

    const firstStepSnapshot = await client.step()
    expect(firstStepSnapshot.iterations).toBe(1)
    expect(client.iterations).toBe(1)
    expect(client.progress).toBe(0.25)

    expect(await client.call("getDoubleCurrent")).toBe(2)
    expect(await client.getConstructorParams()).toEqual([
      { start: 0, target: 4 },
    ])
    expect(await client.preview()).toMatchObject({
      points: [{ x: 1, y: 0 }],
    })

    const solvedSnapshot = await client.solve()
    expect(solvedSnapshot.solved).toBe(true)
    expect(client.solved).toBe(true)
    expect(await client.getOutput()).toEqual({ value: 4 })

    await client.dispose()
    expect(client.snapshot).toBeNull()
    await expect(client.step()).rejects.toThrow(
      "Solver has not been initialized",
    )
  } finally {
    cleanup()
  }
})

test("SolverWorkerClient can stream periodic snapshots during solve", async () => {
  const { client, cleanup } = createWorkerHarness()

  try {
    await client.init({ start: 0, target: 5 })

    const observedIterations: number[] = []
    const unsubscribe = client.subscribe((snapshot) => {
      observedIterations.push(snapshot.iterations)
    })

    await client.solve({ snapshotEvery: 2 })
    unsubscribe()

    expect(observedIterations).toContain(0)
    expect(observedIterations).toContain(2)
    expect(observedIterations).toContain(4)
    expect(observedIterations.at(-1)).toBe(5)
  } finally {
    cleanup()
  }
})
