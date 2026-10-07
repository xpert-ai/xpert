import { SuggestedQuestionsHandler } from './suggested-questions.handler'
import { ChatMessageUpdateJobHandler } from './update-job.handler'
import { ChatMessageUpsertHandler } from './upsert.handler'
import { RefreshConversationResourceCardsHandler } from '../../resource-cards/refresh-resource-cards.handler'

export const CommandHandlers = [
    RefreshConversationResourceCardsHandler,
    ChatMessageUpsertHandler,
    ChatMessageUpdateJobHandler,
    SuggestedQuestionsHandler
]
