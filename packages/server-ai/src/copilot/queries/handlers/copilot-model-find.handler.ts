import { FetchFrom, ICopilotProviderModel, ProviderModel } from '@metad/contracts'
import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { Inject } from '@nestjs/common'
import { AIProvidersService } from '../../../ai-model/index'
import { GetCopilotProviderModelQuery } from '../../../copilot-provider'
import { CopilotService } from '../../copilot.service'
import { CopilotWithProviderDto, ProviderWithModelsDto } from '../../dto'
import { FindCopilotModelsQuery } from '../copilot-model-find.query'
import { ConfigService } from '@metad/server-config'

@QueryHandler(FindCopilotModelsQuery)
export class FindCopilotModelsHandler implements IQueryHandler<FindCopilotModelsQuery> {

	@Inject(ConfigService)
	private readonly configService: ConfigService

	constructor(
		private readonly queryBus: QueryBus,
		private readonly service: CopilotService,
		private readonly providersService: AIProvidersService
	) {}

	public async execute(command: FindCopilotModelsQuery): Promise<CopilotWithProviderDto[]> {
		const copilots = await this.service.findAllCopilots(null, null)
		const copilotSchemas: CopilotWithProviderDto[] = []
		for (const copilot of copilots) {
			if (copilot.modelProvider) {
				const provider = this.providersService.getProvider(copilot.modelProvider.providerName)
				if (provider) {
					// Predefined models
					const predefinedModels = provider.getProviderModels(command.type)
					// Custom models
					const customModels = await this.queryBus.execute<
						GetCopilotProviderModelQuery,
						ICopilotProviderModel[]
					>(new GetCopilotProviderModelQuery(copilot.modelProvider.id))
					const models = []
					if (customModels?.length) {
						models.push(
							...customModels.map(
								(model) =>
									({
										model: model.modelName,
										model_type: model.modelType,
										fetch_from: FetchFrom.CUSTOMIZABLE_MODEL,
										model_properties: model.modelProperties
									}) as ProviderModel
							)
						)
					}

					predefinedModels?.forEach((model) => {
						if (!models.some((_) => _.model === model.model)) {
							models.push(model)
						}
					})

					if (models.length) {
						const providerSchema = provider.getProviderSchema()
						copilotSchemas.push(
							new CopilotWithProviderDto({
								...copilot,
								providerWithModels: new ProviderWithModelsDto({
									...providerSchema,
									models
								}, this.configService.get('baseUrl') as string)
							})
						)
					}
				}
			}
			// else {
			// 	copilotSchemas.push({
			// 		...copilot
			// 	})
			// }
		}

		return copilotSchemas
	}
}
