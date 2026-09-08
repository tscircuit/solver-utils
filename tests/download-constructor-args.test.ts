import { test } from "bun:test"
import { strict as assert } from "node:assert"
import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import ts from "typescript"
import { BaseSolver } from "../lib/BaseSolver"

const source = readFileSync(
  new URL("../lib/react/DownloadDropdown.tsx", import.meta.url),
  "utf8",
)
const jsx = (type: any, props: any) => ({ type, props })
const react = {
  useState: () => [true, () => {}],
  useRef: () => ({ current: null }),
  useEffect: () => {},
  useMemo: (fn: () => any) => fn(),
}

const compile = (
  text: string,
  filename: string,
  dependencies: Record<string, any>,
  globals: Record<string, any> = {},
): any => {
  const { outputText } = ts.transpileModule(text, {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  })
  const module = { exports: {} }
  runInNewContext(outputText, {
    module,
    exports: module.exports,
    require: (id: string) => {
      assert.ok(Object.hasOwn(dependencies, id), `Unexpected import: ${id}`)
      return dependencies[id]
    },
    ...globals,
  })
  return module.exports
}

const findButton = (node: any, label: string): (() => void) | undefined => {
  if (node?.type === "button" && node.props.children === label) {
    return node.props.onClick
  }
  const children = node?.props?.children
  for (const child of Array.isArray(children) ? children : [children]) {
    if (child && typeof child === "object") {
      const handler = findButton(child, label)
      if (handler) return handler
    }
  }
}

class ProbeSolver extends BaseSolver {
  args: any[]
  constructor(...args: any[]) {
    super()
    this.args = args
  }
  override getConstructorParams(): any {
    return this.args
  }
  override _step() {
    this.solved = true
  }
}

const cases: [string, any, any[]][] = [
  ["zero arguments", [], []],
  ["one object argument", [{ limit: 7 }], [{ limit: 7 }]],
  ["multiple arguments", [{ limit: 7 }, 3], [{ limit: 7 }, 3]],
  ["array-valued argument", [[1, 2, 3]], [[1, 2, 3]]],
  ["legacy object", { limit: 7 }, [{ limit: 7 }]],
]

for (const [name, returned, expected] of cases) {
  for (const kind of ["page.tsx", "test.ts"]) {
    test(`${kind} reconstructs ${name}`, async () => {
      const blobs: Blob[] = []
      const alerts: string[] = []
      const { DownloadDropdown } = compile(
        source,
        "DownloadDropdown.tsx",
        {
          react,
          "react/jsx-runtime": { jsx, jsxs: jsx },
        },
        {
          Blob,
          URL: {
            createObjectURL: (blob: Blob) => {
              blobs.push(blob)
              return "blob:test"
            },
            revokeObjectURL: () => {},
          },
          document: { createElement: () => ({ click: () => {} }) },
          alert: (message: string) => alerts.push(message),
        },
      )
      const solver = new ProbeSolver()
      solver.getConstructorParams = () => returned
      const handler = findButton(
        DownloadDropdown({ solver }),
        `Download ${kind}`,
      )
      assert.ok(handler)
      handler()
      assert.deepEqual(alerts, [])
      assert.equal(blobs.length, 1)
      const generated = (await blobs[0]!.text()).replaceAll(
        "import.meta.path",
        '"generated.test.ts"',
      )
      let reconstructed: ProbeSolver | undefined
      const exports = compile(generated, kind, {
        react,
        "react/jsx-runtime": { jsx, jsxs: jsx },
        "lib/solvers/ProbeSolver/ProbeSolver": { ProbeSolver },
        "../components/GenericSolverDebugger": {
          GenericSolverDebugger: () => {},
        },
        "bun:test": {
          test: (_name: string, fn: () => void) => fn(),
          expect: (instance: ProbeSolver) => {
            reconstructed = instance
            return { toMatchSolverSnapshot: () => {} }
          },
        },
      })
      if (kind === "page.tsx") reconstructed = exports.default().props.solver
      assert.ok(reconstructed)
      assert.deepEqual(JSON.parse(JSON.stringify(reconstructed.args)), expected)
    })
  }
}
