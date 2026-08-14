import { XpertAgentExecutionDelHandler } from './execution-delete.handler'
import { XpertAgentExecutionUpsertHandler } from './upsert.handler'
import { WrapWorkflowNodeExecutionHandler } from './wrap-workflow-node-execution.handler'
import { XpertAgentExecutionAddTokensHandler } from './add-tokens.handler'

export const CommandHandlers = [
    XpertAgentExecutionUpsertHandler,
    XpertAgentExecutionAddTokensHandler,
    XpertAgentExecutionDelHandler,
    WrapWorkflowNodeExecutionHandler
]
