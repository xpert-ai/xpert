import { SuggestedQuestionsHandler } from './suggested-questions.handler'
import { ChatMessageUpsertHandler } from './upsert.handler'
import { RefreshConversationResourceCardsHandler } from '../../resource-cards/refresh-resource-cards.handler'

export const CommandHandlers = [
    RefreshConversationResourceCardsHandler,
    ChatMessageUpsertHandler,
    SuggestedQuestionsHandler
]
