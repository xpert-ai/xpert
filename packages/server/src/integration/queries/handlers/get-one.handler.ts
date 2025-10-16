import { Logger } from '@nestjs/common'
import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { GetIntegrationQuery } from '../get-one.query'
import { IntegrationService } from '../../integration.service'

@QueryHandler(GetIntegrationQuery)
export class GetIntegrationHandler implements IQueryHandler<GetIntegrationQuery> {
	protected logger = new Logger(GetIntegrationHandler.name)

	constructor(
		private readonly queryBus: QueryBus,
		private readonly service: IntegrationService,
	) {}

	public async execute(command: GetIntegrationQuery) {
		const { id } = command
		return this.service.findOne(id, command.params)
	}
}
