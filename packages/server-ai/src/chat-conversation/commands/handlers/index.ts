import { CancelSummaryJobHandler } from './cancel-summary.handler'
import { ChatConversationDeleteHandler } from './conversation-delete.handler'
import { ScheduleSummaryJobHandler } from './schedule-summary.handler'
import { ChatConversationUpsertHandler } from './upsert.handler'

export const CommandHandlers = [
    ChatConversationUpsertHandler,
    ChatConversationDeleteHandler,
    ScheduleSummaryJobHandler,
    CancelSummaryJobHandler
]
