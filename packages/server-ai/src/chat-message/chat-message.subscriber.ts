import { RequestContext } from '@metad/server-core'
import { EntitySubscriberInterface, EventSubscriber, InsertEvent } from 'typeorm'
import { ChatMessage } from './chat-message.entity'

@EventSubscriber()
export class ChatMessageSubscriber implements EntitySubscriberInterface<ChatMessage> {
	/**
	 * Indicates that this subscriber only listen to Entity events.
	 */
	listenTo() {
		return ChatMessage
	}

	beforeInsert(event: InsertEvent<ChatMessage>): Promise<any> | void {
		if (event.entity) {
			event.entity.tenantId ??= RequestContext.currentTenantId()
			event.entity.organizationId ??= RequestContext.getOrganizationId()
		}
	}
}
