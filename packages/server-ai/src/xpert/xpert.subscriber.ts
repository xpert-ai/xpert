import { RequestContext } from '@metad/server-core'
import { EntitySubscriberInterface, EventSubscriber, InsertEvent } from 'typeorm'
import { Xpert } from './xpert.entity'
import { convertToUrlPath } from '@metad/contracts'

@EventSubscriber()
export class XpertSubscriber implements EntitySubscriberInterface<Xpert> {
	/**
	 * Indicates that this subscriber only listen to Xpert events.
	 */
	listenTo() {
		return Xpert
	}

	beforeInsert(event: InsertEvent<Xpert>): Promise<any> | void {
		if (!event.entity.slug) {
			event.entity.slug = convertToUrlPath(event.entity.name)
		}
		if (event.entity.agent) {
			event.entity.agent.tenantId = RequestContext.currentTenantId() || event.entity.tenantId
			event.entity.agent.organizationId = RequestContext.getOrganizationId() || event.entity.organizationId
		}
	}
}
