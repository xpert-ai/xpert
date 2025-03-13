import { CompleteToolCallsHandler } from './complete-tool-calls.handler'
import { XpertAgentVariableSchemaHandler } from './get-variable-schema.handler'
import { XpertAgentVariablesHandler } from './get-variables.handler'

export const QueryHandlers = [
    CompleteToolCallsHandler,
    XpertAgentVariablesHandler,
    XpertAgentVariableSchemaHandler
]
