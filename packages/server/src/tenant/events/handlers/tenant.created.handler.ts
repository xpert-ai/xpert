import { IEventHandler } from '@nestjs/cqrs'
import { EventsHandler } from '@nestjs/cqrs/dist/decorators/events-handler.decorator'
import chalk from 'chalk'
import { TenantCreatedEvent } from '../tenant.created.event'

@EventsHandler(TenantCreatedEvent)
export class TenantCreatedHandler implements IEventHandler<TenantCreatedEvent>
{
	handle(event: TenantCreatedEvent) {
		console.log(chalk.magenta(`Tenant '${event.tenantName}' Created: ${event.tenantId}`))
	}
}
