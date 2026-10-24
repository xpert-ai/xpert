import { AssertXpertAgentExecutionAccessHandler } from './assert-access.handler'
import { FindExecutionsByXpertHandler } from './find-by-expert.handler'
import { FindAgentExecutionsHandler } from './find.handler'
import { XpertAgentExecutionCheckpointsHandler } from './get-checkpoints.handler'
import { XpertAgentExecutionStateHandler } from './get-state.handler'
import { XpertAgentExecutionOneHandler } from './get-one.handler'
import { GetAgentExecutionRunSummaryHandler } from './get-run-summary.handler'
import { GetAgentExecutionRunStatusHandler } from './get-run-status.handler'
import { GetThreadContextUsageHandler } from './get-thread-context-usage.handler'

export const QueryHandlers = [
    AssertXpertAgentExecutionAccessHandler,
    FindExecutionsByXpertHandler,
    FindAgentExecutionsHandler,
    XpertAgentExecutionCheckpointsHandler,
    XpertAgentExecutionOneHandler,
    GetAgentExecutionRunSummaryHandler,
    GetAgentExecutionRunStatusHandler,
    XpertAgentExecutionStateHandler,
    GetThreadContextUsageHandler
]
