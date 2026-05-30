import { CheckpointDeleteHandler } from './checkpoint-delete.handler'
import { CopilotCheckpointRetentionDryRunHandler, CopilotCheckpointRetentionExecuteHandler } from './retention.handler'

export const CommandHandlers = [
    CheckpointDeleteHandler,
    CopilotCheckpointRetentionDryRunHandler,
    CopilotCheckpointRetentionExecuteHandler
]
