import { CopilotCheckLimitHandler } from './check-limit.handler'
import { CopilotTokenRecordHandler } from './token-record.handler'
import { CopilotModelUsageRecordHandler } from './model-usage-record.handler'

export const CommandHandlers = [CopilotTokenRecordHandler, CopilotModelUsageRecordHandler, CopilotCheckLimitHandler]
