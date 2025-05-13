import { Tenant, TenantCreatedEvent } from '@metad/server-core'
import { Logger } from '@nestjs/common'
import { IEventHandler } from '@nestjs/cqrs'
import { EventsHandler } from '@nestjs/cqrs/dist/decorators/events-handler.decorator'
import { InjectEntityManager } from '@nestjs/typeorm'
import { EntityManager } from 'typeorm'
import { seedDefaultDataSourceTypes } from '../../data-source-type.seed'

/**
 * @deprecated used @OnEvent('tenant.created')
 */
@EventsHandler(TenantCreatedEvent)
export class TenantCreatedHandler implements IEventHandler<TenantCreatedEvent> {
	private readonly logger = new Logger(TenantCreatedHandler.name)

	constructor(
		@InjectEntityManager()
		private entityManager: EntityManager
	) {}

	async handle(event: TenantCreatedEvent) {
		this.logger.debug('Tenant Created Event: seed dataSource types')
		const { tenantId } = event
		const tenant = await this.entityManager.findOne(Tenant, tenantId)
		await seedDefaultDataSourceTypes(this.entityManager.connection, tenant)
	}
}
