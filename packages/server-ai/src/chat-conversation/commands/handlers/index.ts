import { CancelSummaryJobHandler } from './cancel-summary.handler'
import { ChatConversationDeleteHandler } from './conversation-delete.handler'
import { ChatConversationUpdateHandler } from './conversation-update.handler'
import { ScheduleSummaryJobHandler } from './schedule-summary.handler'
import { ChatConversationUpsertHandler } from './upsert.handler'

export const CommandHandlers = [
    ChatConversationUpsertHandler,
    ChatConversationUpdateHandler,
    ChatConversationDeleteHandler,

    ScheduleSummaryJobHandler,
    CancelSummaryJobHandler
]
