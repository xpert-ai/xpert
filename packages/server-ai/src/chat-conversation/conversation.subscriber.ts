import { EntitySubscriberInterface, EventSubscriber } from 'typeorm'
import { ChatConversation } from './conversation.entity'

@EventSubscriber()
export class ChatConversationSubscriber implements EntitySubscriberInterface<ChatConversation> {
	/**
	 * Indicates that this subscriber only listen to Entity events.
	 */
	listenTo() {
		return ChatConversation
	}

	afterLoad(entity: ChatConversation): void {
		if (entity?.messages) {
			entity.messages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
		}
	}
}
