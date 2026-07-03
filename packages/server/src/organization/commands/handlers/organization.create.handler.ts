import { IOrganization } from '@xpert-ai/contracts'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { CommandBus, CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { getManager } from 'typeorm'
import { RequestContext } from '../../../core/context/request-context'
import { EVENT_ORGANIZATION_CREATED, OrganizationCreatedEvent } from '../../events'
import { OrganizationService } from '../../organization.service'
import { OrganizationCreateCommand } from '../organization.create.command'
import { Organization } from './../../../core/entities/internal'
import { ImportRecordUpdateOrCreateCommand } from './../../../export-import/import-record/commands/import-record-update-or-create.command'

@CommandHandler(OrganizationCreateCommand)
export class OrganizationCreateHandler implements ICommandHandler<OrganizationCreateCommand> {
	constructor(
		private readonly commandBus: CommandBus,
		private readonly organizationService: OrganizationService,
		private readonly eventEmitter: EventEmitter2
	) {}

	public async execute(command: OrganizationCreateCommand): Promise<IOrganization> {
		const { input } = command
		const { isImporting = false, sourceId = null, tenantId = null } = input

		// let { contact = {} } = input;
		// delete input['contact'];

		// 3. Create organization
		const createdOrganization: IOrganization = await this.organizationService.create({
			...input,
			show_profits: input.show_profits || false,
			show_bonuses_paid: input.show_bonuses_paid || false,
			show_income: input.show_income || false,
			show_total_hours: input.show_total_hours || false,
			show_projects_count: input.show_projects_count || true,
			show_minimum_project_size: input.show_minimum_project_size || true,
			show_clients_count: input.show_clients_count || true,
			show_clients: input.show_clients || true,
			show_employees_count: input.show_employees_count || true
			// brandColor: faker.internet.color()
		})

		//5. Create contact details of created organization
		const { id } = createdOrganization
		// contact = Object.assign({}, contact, {
		// 	organizationId: id,
		// 	tenantId
		// });

		const organization = await this.organizationService.create({
			// contact,
			...createdOrganization
		})

		// //6. Create Enabled/Disabled reports for relative organization.
		// await this.commandBus.execute(
		// 	new ReportOrganizationCreateCommand(organization)
		// );

		//7. Create Import Records while migrating for relative organization.
		if (isImporting && sourceId) {
			const { sourceId } = input
			const entityType = getManager().getRepository(Organization).metadata.tableName
			await this.commandBus.execute(
				new ImportRecordUpdateOrCreateCommand({
					entityType,
					sourceId,
					destinationId: organization.id,
					tenantId
				})
			)
		}

		this.eventEmitter.emit(
			EVENT_ORGANIZATION_CREATED,
			new OrganizationCreatedEvent(organization.tenantId, organization.id, RequestContext.currentUserId() ?? null)
		)

		return await this.organizationService.findOne(id)
	}
}
