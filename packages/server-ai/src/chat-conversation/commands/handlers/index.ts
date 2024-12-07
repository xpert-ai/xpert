import { ChatConversationCreateHandler } from './conversation-create.handler'
import { ChatConversationDeleteHandler } from './conversation-delete.handler'
import { ChatConversationUpdateHandler } from './conversation-update.handler'
import { ChatConversationUpsertHandler } from './upsert.handler'

export const CommandHandlers = [
    ChatConversationUpsertHandler,
    ChatConversationCreateHandler,
    ChatConversationUpdateHandler,
    ChatConversationDeleteHandler
]
