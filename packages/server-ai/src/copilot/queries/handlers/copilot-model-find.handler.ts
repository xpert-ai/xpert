import { FetchFrom, ICopilotProviderModel, ProviderModel } from '@metad/contracts'
import { ConfigService } from '@metad/server-config'
import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { Inject } from '@nestjs/common'
import { AIProvidersService } from '../../../ai-model/index'
import { GetCopilotProviderModelQuery } from '../../../copilot-provider'
import { CopilotService } from '../../copilot.service'
import { CopilotWithProviderDto, ProviderWithModelsDto } from '../../dto'
import { FindCopilotModelsQuery } from '../copilot-model-find.query'
import { CopilotProviderPublicDto } from '../../../copilot-provider/dto'

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
		const copilots = await this.service.findAllAvailablesCopilots(null, null)
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
					>(new GetCopilotProviderModelQuery(copilot.modelProvider.id, {modelType: command.type}))
					const models = []
					if (customModels?.length) {
						models.push(
							...customModels.map(
								(model) =>
									({
										model: model.modelName,
										model_type: model.modelType,
										fetch_from: FetchFrom.CUSTOMIZABLE_MODEL,
										model_properties: model.modelProperties,
										label: {
											zh_Hans: model.modelName,
											en_US: model.modelName,
										}
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
						const baseUrl = this.configService.get('baseUrl') as string
						copilotSchemas.push(
							new CopilotWithProviderDto({
								...copilot,
								modelProvider: new CopilotProviderPublicDto(copilot.modelProvider, baseUrl),
								providerWithModels: new ProviderWithModelsDto({
									...providerSchema,
									models
								}, baseUrl)
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
