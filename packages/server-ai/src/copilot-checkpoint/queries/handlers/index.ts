import { GetCopilotCheckpointsByParentHandler } from './get-by-parent.handler'
import { CopilotCheckpointGetTupleHandler } from './get-tuple.handler'
import { CopilotCheckpointGetMetadataHandler } from './get-metadata.handler'

export const QueryHandlers = [
    CopilotCheckpointGetTupleHandler,
    GetCopilotCheckpointsByParentHandler,
    CopilotCheckpointGetMetadataHandler
]
