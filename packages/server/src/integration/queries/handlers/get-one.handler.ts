import { Logger, NotFoundException } from '@nestjs/common'
import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { GetIntegrationQuery } from '../get-one.query'
import { IntegrationService } from '../../integration.service'
import { t } from 'i18next'

@QueryHandler(GetIntegrationQuery)
export class GetIntegrationHandler implements IQueryHandler<GetIntegrationQuery> {
	protected logger = new Logger(GetIntegrationHandler.name)

	constructor(
		private readonly queryBus: QueryBus,
		private readonly service: IntegrationService
	) {}

	public async execute(command: GetIntegrationQuery) {
		const { id } = command
		const integration = await this.service.findOneInOrganizationOrTenant(id, command.params)
		if (!integration) throw new NotFoundException(t('server-ai:Error.IntegrationUnavailable'))
		return integration
	}
}
