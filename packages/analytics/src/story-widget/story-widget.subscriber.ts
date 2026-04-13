import { RequestContext } from '@xpert-ai/server-core'
import { EntitySubscriberInterface, EventSubscriber, InsertEvent } from 'typeorm'
import { StoryWidget } from './story-widget.entity'

@EventSubscriber()
export class StoryWidgetSubscriber implements EntitySubscriberInterface<StoryWidget> {
	/**
	 * Indicates that this subscriber only listen to Entity events.
	 */
	listenTo() {
		return StoryWidget
	}

	beforeInsert(event: InsertEvent<StoryWidget>): void | Promise<any> {
		if (!event.entity.tenantId) {
			event.entity.tenantId = RequestContext.currentTenantId()
		}
		if (!event.entity.organizationId) {
			event.entity.organizationId = RequestContext.getOrganizationId()
		}
		if (!event.entity.createdById) {
			event.entity.createdById = RequestContext.currentUserId()
		}
	}
}
