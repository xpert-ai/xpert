import { XpertAgentExecutionDelHandler } from './execution-delete.handler'
import { XpertAgentExecutionUpsertHandler } from './upsert.handler'

export const CommandHandlers = [
    XpertAgentExecutionUpsertHandler,
    XpertAgentExecutionDelHandler
]
