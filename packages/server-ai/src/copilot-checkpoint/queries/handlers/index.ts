import { GetCopilotCheckpointsByParentHandler } from "./get-by-parent.handler";
import { CopilotCheckpointGetTupleHandler } from "./get-tuple.handler";

export const QueryHandlers = [
    CopilotCheckpointGetTupleHandler,
    GetCopilotCheckpointsByParentHandler
]
