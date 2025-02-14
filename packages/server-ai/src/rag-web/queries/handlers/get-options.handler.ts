import { Logger } from '@nestjs/common'
import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { GetRagWebOptionsQuery } from '../get-options.query'
import { TKDocumentWebSchema } from '@metad/contracts'
import { Providers } from '../../provider'

@QueryHandler(GetRagWebOptionsQuery)
export class GetRagWebOptionsHandler implements IQueryHandler<GetRagWebOptionsQuery> {
	protected logger = new Logger(GetRagWebOptionsHandler.name)

	constructor(
		private readonly queryBus: QueryBus,
	) {}

	public async execute(command: GetRagWebOptionsQuery): Promise<TKDocumentWebSchema> {
		const { type } = command
		return Providers[type]?.schema
	}
}
