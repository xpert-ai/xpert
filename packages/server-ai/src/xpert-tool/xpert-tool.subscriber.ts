import { BadRequestException } from '@nestjs/common'
import { validateToolName } from '@xpert-ai/server-common'
import { RequestContext } from '@xpert-ai/server-core'
import { EntitySubscriberInterface, EventSubscriber, InsertEvent, UpdateEvent } from 'typeorm'
import { XpertTool } from './xpert-tool.entity'


@EventSubscriber()
export class XpertToolSubscriber implements EntitySubscriberInterface<XpertTool> {
	/**
	 * Indicates that this subscriber only listen to Xpert tool events.
	 */
	listenTo() {
		return XpertTool
	}

	beforeInsert(event: InsertEvent<XpertTool>): Promise<any> | void {
		if (event.entity) {
			event.entity.tenantId ??= RequestContext.currentTenantId()
			event.entity.organizationId ??= RequestContext.getOrganizationId()

			this.validateToolName(event.entity.name)
		}
	}

	beforeUpdate(event: UpdateEvent<XpertTool>): Promise<any> | void {
		if (event.entity) {
			this.validateToolName(event.entity.name)
		}
	}

	validateToolName(name: string) {
		if (!validateToolName(name)) {
			throw new BadRequestException(`Tool name '${name}' is not valid`)
		}
	}
}
