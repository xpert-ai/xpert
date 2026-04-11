import { RequestContext } from '@xpert-ai/server-core'
import { EntitySubscriberInterface, EventSubscriber, InsertEvent } from 'typeorm'
import { StoryPoint } from './story-point.entity'

@EventSubscriber()
export class StoryPointSubscriber implements EntitySubscriberInterface<StoryPoint> {
	/**
	 * Indicates that this subscriber only listen to Entity events.
	 */
	listenTo() {
		return StoryPoint
	}

	beforeInsert(event: InsertEvent<StoryPoint>): void | Promise<any> {
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
