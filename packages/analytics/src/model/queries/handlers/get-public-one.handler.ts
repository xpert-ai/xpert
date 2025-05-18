import { Logger } from '@nestjs/common'
import { CommandBus, IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { SemanticModelService } from '../../model.service'
import { GetOnePublicSemanticModelQuery } from '../get-public-one.query'

@QueryHandler(GetOnePublicSemanticModelQuery)
export class GetOnePublicSemanticModelHandler implements IQueryHandler<GetOnePublicSemanticModelQuery> {
	private readonly logger = new Logger(GetOnePublicSemanticModelHandler.name)
	constructor(
		private readonly commandBus: CommandBus,
		private modelsService: SemanticModelService
	) {}

	async execute(query: GetOnePublicSemanticModelQuery) {
		const modelId = query.id

		return await this.modelsService.findPublicOne(modelId)
	}
}
