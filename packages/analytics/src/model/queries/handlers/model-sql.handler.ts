import { uuid } from '@metad/ocap-core'
import { Logger } from '@nestjs/common'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { SemanticModelService } from '../../model.service'
import { ModelSqlQuery } from '../model-sql.query'

@QueryHandler(ModelSqlQuery)
export class ModelSqlHandler implements IQueryHandler<ModelSqlQuery> {
	private readonly logger = new Logger(ModelSqlHandler.name)
	constructor(private modelsService: SemanticModelService) {}

	async execute(query: ModelSqlQuery) {
		const { modelId, options } = query

		return await this.modelsService.query(modelId, options.body, {
			id: uuid()
		})
	}
}
