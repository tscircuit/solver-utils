import { runSolverWorker } from "../../../lib"
import { handlers, type TestTasks } from "./tasks"

await runSolverWorker<TestTasks>(handlers)
