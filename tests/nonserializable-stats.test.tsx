import { expect, test } from "bun:test"
import type { ReactElement } from "react"
import { GenericSolverStatsSummary } from "../lib/react/GenericSolverStatsSummary"

const {
  renderToStaticMarkup,
}: {
  renderToStaticMarkup: (element: ReactElement) => string
} = require("react-dom/server")

const renderStats = (stats: Record<string, unknown>) =>
  renderToStaticMarkup(
    <GenericSolverStatsSummary solverName="ExampleSolver" stats={stats} />,
  )

test("stats containing BigInt render without losing integer precision", () => {
  const stats = { count: 9007199254740993n, progress: 0.5 }
  const html = renderStats(stats)

  expect(html).toContain("count: 9007199254740993")
  expect(html).toContain("&quot;count&quot;: &quot;9007199254740993&quot;")
  expect(html).toContain("&quot;progress&quot;: 0.5")
  expect(stats.count).toBe(9007199254740993n)
})

test("cyclic statistics render other values and identify the circular reference", () => {
  const node: { name: string; parent?: unknown } = { name: "candidate" }
  node.parent = node
  const html = renderStats({ node, iterations: 42 })

  expect(html).toContain("iterations: 42")
  expect(html).toContain("&quot;name&quot;: &quot;candidate&quot;")
  expect(html).toContain("&quot;parent&quot;: &quot;[Circular]&quot;")
  expect(node.parent).toBe(node)
})

test("repeated non-circular references retain their contents in each location", () => {
  const shared = { label: "shared-value", count: 3 }
  const html = renderStats({ first: shared, second: shared })
  const tooltip = html.slice(html.indexOf("<pre"))

  expect(tooltip.match(/shared-value/g)).toHaveLength(2)
  expect(tooltip).not.toContain("[Circular]")
})

test("ordinary statistics retain their JSON types and formatting", () => {
  const html = renderStats({ count: 4, values: [true, null, "ok"] })

  expect(html).toContain("&quot;count&quot;: 4")
  expect(html).toContain("true,\n    null,\n    &quot;ok&quot;")
})
