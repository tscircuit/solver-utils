import { strict as assert } from "node:assert"
import { mkdtemp, mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runInNewContext } from "node:vm"

const root = Bun.fileURLToPath(new URL("../", import.meta.url))
const temporary = await mkdtemp(join(tmpdir(), "solver-runtime-package-"))

async function run(command: string[], cwd = temporary): Promise<void> {
  const process = Bun.spawn(command, { cwd, stdout: "pipe", stderr: "pipe" })
  const [stdout, stderr, code] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ])
  if (code !== 0) throw new Error(command.join(" ") + "\n" + stdout + stderr)
}

async function bundle(
  path: string,
  target: "bun" | "node" | "browser",
  format: "esm" | "cjs" | "iife",
): Promise<string> {
  const result = await Bun.build({
    entrypoints: [path],
    target,
    format,
    splitting: false,
  })
  if (!result.success)
    throw new AggregateError(result.logs, "Consumer bundle failed")
  return result.outputs[0]!.text()
}

try {
  await run(
    [
      process.execPath,
      "pm",
      "pack",
      "--ignore-scripts",
      "--filename",
      join(temporary, "package.tgz"),
    ],
    root,
  )
  const installed = join(temporary, "node_modules/@tscircuit/solver-utils")
  await mkdir(installed, { recursive: true })
  await run([
    "tar",
    "-xzf",
    join(temporary, "package.tgz"),
    "--strip-components=1",
    "-C",
    installed,
  ])
  // Bundle the real installed peer/dependencies into the isolated consumer.
  // This checks solver-utils' package boundary without a network install or symlinks.
  const peer = join(temporary, "node_modules/graphics-debug")
  await mkdir(peer, { recursive: true })
  await Bun.write(
    join(peer, "package.json"),
    JSON.stringify({
      name: "graphics-debug",
      type: "module",
      exports: "./index.js",
    }),
  )
  await Bun.write(
    join(peer, "index.js"),
    await bundle(
      Bun.fileURLToPath(import.meta.resolve("graphics-debug")),
      "browser",
      "esm",
    ),
  )
  await Bun.write(
    join(temporary, "package.json"),
    JSON.stringify({ type: "module" }),
  )
  await Bun.write(
    join(temporary, "solvers.ts"),
    `
import { BaseSolver, SolverRuntime } from "@tscircuit/solver-utils"
export class SquareSolver extends BaseSolver {
  constructor(input) { super(); this.input = input }
  _step() {
    this.output = { square: this.input.value ** 2, worker: globalThis.solverWorker === true }
    this.solved = true
  }
  getOutput() { return this.output }
}
SolverRuntime.registerSolver("square", SquareSolver)
export class ParentSolver extends BaseSolver {
  constructor(input) { super(); this.input = input }
  _step() {
    this.output = this.input.values.map(value => value ** 2)
    this.solved = true
  }
  async solveAsync(runtime) {
    const results = await Promise.all(this.input.values.map(value => runtime.executeAsync("square", { value })))
    this.output = results.map(result => result.square)
    this.solved = true
  }
  getOutput() { return this.output }
}
class FailureSolver extends BaseSolver {
  _step() { throw new TypeError("intentional packed worker failure") }
}
SolverRuntime.registerSolver("parent", ParentSolver)
SolverRuntime.registerSolver("failure", FailureSolver)
`,
  )
  for (const target of ["node", "bun"] as const) {
    const worker = join(temporary, "worker-" + target + ".ts")
    await Bun.write(
      worker,
      `
import { SolverRuntime } from "@tscircuit/solver-utils/runtime/${target}"
import "./solvers"
globalThis.solverWorker = true
SolverRuntime.listen()
`,
    )
    const source = await bundle(
      worker,
      target,
      target === "node" ? "cjs" : "esm",
    )
    await Bun.write(
      join(temporary, "source-" + target + ".js"),
      "export default " + JSON.stringify(source),
    )
    const consumer = join(temporary, "consumer-" + target + ".ts")
    await Bun.write(
      consumer,
      `
import assert from "node:assert/strict"
import { SolverRuntime as InlineRuntime } from "@tscircuit/solver-utils"
import { SolverRuntime } from "@tscircuit/solver-utils/runtime/${target}"
import source from "./source-${target}.js"
import { ParentSolver, SquareSolver } from "./solvers"
InlineRuntime.registerSolver("local-only", SquareSolver)
const inline = new InlineRuntime()
const threads = new SolverRuntime({ workerSource: source, workerCount: 2, requireWorker: true })
const flexible = new SolverRuntime({ workerSource: source, workerCount: 1 })
try {
  const inputs = Array.from({ length: 8 }, (_, value) => ({ value }))
  const serial = await Promise.all(inputs.map(input => inline.executeAsync("square", input)))
  const parallel = await Promise.all(inputs.map(input => threads.executeAsync("square", input)))
  assert.deepEqual(parallel.map(x => x.square), serial.map(x => x.square))
  assert.ok(parallel.every(x => x.worker))
  const strict = await Promise.allSettled([threads.executeAsync("local-only", { value: 2 })])
  assert.equal(strict[0].status, "rejected")
  assert.deepEqual(await flexible.executeAsync("local-only", { value: 3 }), { square: 9, worker: false })
  const input = { values: [1, 2, 3, 4] }
  const serialParent = new ParentSolver(input)
  serialParent.solve()
  const parent = new ParentSolver(input)
  await parent.solveAsync(threads)
  assert.deepEqual(parent.getOutput(), serialParent.getOutput())
  assert.deepEqual(await flexible.executeAsync("parent", input), serialParent.getOutput())
  await assert.rejects(threads.executeAsync("failure", {}), { name: "TypeError", message: "intentional packed worker failure" })
} finally {
  await Promise.all([inline.dispose(), threads.dispose(), flexible.dispose()])
}
`,
    )
    // Test installed exports and a second bundle that inlines the entire runtime.
    for (const rebundle of [false, true]) {
      const output = join(
        temporary,
        "consumer-" + target + "-" + rebundle + ".js",
      )
      if (rebundle)
        await Bun.write(output, await bundle(consumer, target, "esm"))
      else {
        const build = await Bun.build({
          entrypoints: [consumer],
          target,
          external: ["@tscircuit/solver-utils", "@tscircuit/solver-utils/*"],
          format: "esm",
        })
        if (!build.success)
          throw new AggregateError(
            build.logs,
            "Externalized consumer build failed",
          )
        await Bun.write(output, await build.outputs[0]!.text())
      }
      await run([target === "node" ? "node" : process.execPath, output])
      console.log(
        "Packed " + target + " consumer passed (rebundled=" + rebundle + ")",
      )
    }
  }
  const browser = join(temporary, "browser.ts")
  await Bun.write(
    browser,
    `
import { SolverRuntime } from "@tscircuit/solver-utils"
import "./solvers"
globalThis.checkRuntime = async () => {
  const runtime = new SolverRuntime()
  try { return await runtime.executeAsync("square", { value: 7 }) }
  finally { await runtime.dispose() }
}
`,
  )
  const browserSource = await bundle(browser, "browser", "iife")
  assert.ok(!browserSource.includes("node:worker_threads"))
  const context: Record<string, any> = {
    MessageChannel,
    TextEncoder,
    TextDecoder,
    setTimeout,
    clearTimeout,
    console,
  }
  runInNewContext(browserSource, context)
  assert.equal((await context.checkRuntime()).square, 49)
  console.log("Packed browser bundle and inline execution passed")
} finally {
  await rm(temporary, { recursive: true, force: true })
}
