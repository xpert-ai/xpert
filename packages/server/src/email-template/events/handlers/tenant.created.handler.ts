import { CommandBus, EventsHandler, IEventHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import chalk from 'chalk'
import { Repository } from 'typeorm'
import { TenantCreatedEvent, TenantService } from '../../../tenant/'
import { EmailTemplate } from '../../email-template.entity'
import { createDefaultEmailTemplates } from '../../email-template.seed'

@EventsHandler(TenantCreatedEvent)
export class TenantCreatedHandler implements IEventHandler<TenantCreatedEvent> {
	constructor(
		@InjectRepository(EmailTemplate)
		private readonly emailRepository: Repository<EmailTemplate>,
		private readonly tenantService: TenantService,
		private readonly commandBus: CommandBus
	) {}

	async handle(event: TenantCreatedEvent) {
		const tenant = await this.tenantService.findOne(event.tenantId)

		await createDefaultEmailTemplates(this.emailRepository.manager.connection, tenant)

		const templates = await this.emailRepository.find({
			where: {
				tenantId: tenant.id,
			}
		})

		console.log(chalk.magenta(`Seed (${templates.length}) email templates for Tenant '${event.tenantName}'`))
	}
}
