import { Logger } from '@nestjs/common'
import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { LarkService } from '../../lark.service'
import { GetLarkClientQuery } from '../get-client.query'

@QueryHandler(GetLarkClientQuery)
export class GetLarkClientHandler implements IQueryHandler<GetLarkClientQuery> {
	protected logger = new Logger(GetLarkClientHandler.name)

	constructor(
		private readonly queryBus: QueryBus,
		private readonly larkService: LarkService
	) {}

	public async execute(command: GetLarkClientQuery) {
		const { integrationId } = command

		return this.larkService.getOrCreateLarkClientById(integrationId)
	}
}
