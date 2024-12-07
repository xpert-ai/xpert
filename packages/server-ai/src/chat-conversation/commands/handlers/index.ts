import { ChatConversationCreateHandler } from './conversation-create.handler'
import { ChatConversationUpdateHandler } from './conversation-update.handler'
import { ChatConversationUpsertHandler } from './upsert.handler'

export const CommandHandlers = [
    ChatConversationUpsertHandler,
    ChatConversationCreateHandler,
    ChatConversationUpdateHandler,
]
