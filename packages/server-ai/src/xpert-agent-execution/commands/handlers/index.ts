import { XpertAgentExecutionDelHandler } from './execution-delete.handler'
import { XpertAgentExecutionUpsertHandler } from './upsert.handler'
import { WrapWorkflowNodeExecutionHandler } from './wrap-workflow-node-execution.handler'

export const CommandHandlers = [
    XpertAgentExecutionUpsertHandler,
    XpertAgentExecutionDelHandler,
    WrapWorkflowNodeExecutionHandler
]
