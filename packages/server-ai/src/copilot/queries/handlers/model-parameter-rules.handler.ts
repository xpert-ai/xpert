import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { AIProvidersService } from '../../../ai-model/index'
import { ModelParameterRulesQuery } from '../model-parameter-rules.query'

@QueryHandler(ModelParameterRulesQuery)
export class ModelParameterRulesHandler implements IQueryHandler<ModelParameterRulesQuery> {
	constructor(
		private readonly providersService: AIProvidersService,
		private readonly queryBus: QueryBus
	) {}

	public async execute(command: ModelParameterRulesQuery): Promise<any[]> {
		const { provider, modelType, model } = command

		const modelProvider = this.providersService.getProvider(provider)

		return modelProvider.getModelManager(modelType)?.getParameterRules(model, null)
	}
}
