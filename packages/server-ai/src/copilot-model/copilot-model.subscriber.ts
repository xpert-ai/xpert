import { RequestContext } from '@xpert-ai/server-core'
import { EntitySubscriberInterface, EventSubscriber, InsertEvent } from 'typeorm'
import { CopilotModel } from './copilot-model.entity'

@EventSubscriber()
export class CopilotModelSubscriber implements EntitySubscriberInterface<CopilotModel> {
	/**
	 * Indicates that this subscriber only listen to CopilotModel events.
	 */
	listenTo() {
		return CopilotModel
	}

	beforeInsert(event: InsertEvent<CopilotModel>): Promise<any> | void {
		if (event.entity) {
			event.entity.tenantId = RequestContext.currentTenantId() || event.entity.tenantId
			event.entity.organizationId = RequestContext.getOrganizationId() || event.entity.organizationId
		}
	}
}
