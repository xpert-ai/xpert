import { XpertAgentExecutionDelHandler } from './execution-delete.handler'
import { XpertAgentExecutionUpsertHandler } from './upsert.handler'
import { WrapWorkflowNodeExecutionHandler } from './wrap-workflow-node-execution.handler'
import { XpertAgentExecutionRecordUsageHandler } from './record-usage.handler'

export const CommandHandlers = [
    XpertAgentExecutionUpsertHandler,
    XpertAgentExecutionRecordUsageHandler,
    XpertAgentExecutionDelHandler,
    WrapWorkflowNodeExecutionHandler
]
