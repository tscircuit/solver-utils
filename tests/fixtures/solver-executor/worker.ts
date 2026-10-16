import { runSolverWorker } from "../../../lib/execution/node/runSolverWorker"
import { handlers, type TestTasks } from "./tasks"

runSolverWorker<TestTasks>(handlers)
