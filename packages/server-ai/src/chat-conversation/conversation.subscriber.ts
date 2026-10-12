import { McpAppHistory } from '../mcp-app-runtime/mcp-app-history.entity'
import { EntitySubscriberInterface, EventSubscriber, SoftRemoveEvent } from 'typeorm'
import { ChatConversation } from './conversation.entity'

@EventSubscriber()
export class ChatConversationSubscriber implements EntitySubscriberInterface<ChatConversation> {
    /**
     * Indicates that this subscriber only listen to Entity events.
     */
    listenTo() {
        return ChatConversation
    }

    async beforeSoftRemove(event: SoftRemoveEvent<ChatConversation>) {
        const id = event.entity?.id ?? event.databaseEntity?.id
        if (id) await event.manager.delete(McpAppHistory, { conversationId: id })
    }

    afterLoad(entity: ChatConversation): void {
        if (entity?.messages) {
            entity.messages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        }
    }
}
