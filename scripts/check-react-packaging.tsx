import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
const { BaseSolver }: typeof import("../lib/BaseSolver") = await import(
  new URL("../dist/index.js", import.meta.url).href
)
const {
  GenericSolverDebugger,
}: typeof import("../lib/react/GenericSolverDebugger") = await import(
  new URL("../dist/react/index.js", import.meta.url).href
)

const solver = new BaseSolver()
const markup = renderToStaticMarkup(
  <GenericSolverDebugger
    solver={solver}
    customRenderer={{
      name: "3D",
      render: () => <div>Built React entrypoint</div>,
      getDownload: () => ({ meshes: [] }),
    }}
  />,
)
if (!markup.includes("Built React entrypoint"))
  throw new Error("Built React debugger did not render")
console.log("Built React debugger uses the consumer's React instance")
