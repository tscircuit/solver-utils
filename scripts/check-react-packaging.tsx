import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { BaseSolver } from "../dist/index.js"
import { GenericSolverDebugger } from "../dist/react/index.js"

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
