import { AiModelTypeEnum, FetchFrom, ICopilotProviderModel, ModelFeature, ProviderModel } from '@xpert-ai/contracts'
import { ConfigService } from '@xpert-ai/server-config'
import { RequestContext } from '@xpert-ai/server-core'
import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { Inject } from '@nestjs/common'
import { AIProvidersService } from '../../../ai-model/index'
import { GetCopilotProviderModelQuery } from '../../../copilot-provider'
import { CopilotService } from '../../copilot.service'
import { CopilotWithProviderDto, ProviderWithModelsDto } from '../../dto'
import { FindCopilotModelsQuery } from '../copilot-model-find.query'
import { CopilotProviderPublicDto } from '../../../copilot-provider/dto'
import { MembershipService } from '../../../membership'

/**
 * Builds the LLM/model catalog visible to the current tenant and organization.
 * It combines provider built-ins, provider custom model records, and the
 * copilot's already-selected model so custom selections remain importable even
 * when they are absent from the provider catalog query.
 */
@QueryHandler(FindCopilotModelsQuery)
export class FindCopilotModelsHandler implements IQueryHandler<FindCopilotModelsQuery> {
	@Inject(ConfigService)
	private readonly configService: ConfigService

	constructor(
		private readonly queryBus: QueryBus,
		private readonly service: CopilotService,
		private readonly providersService: AIProvidersService,
		private readonly membershipService: MembershipService
	) {}

	/**
	 * Returns visible copilots with their provider metadata and available models
	 * for the requested model type.
	 */
	public async execute(command: FindCopilotModelsQuery): Promise<CopilotWithProviderDto[]> {
		const copilots = command.forMembershipManagement
            ? await this.service.findAllEnabledCopilotsWithoutMembership(
                  RequestContext.currentTenantId(),
                  RequestContext.getOrganizationId()
              )
			: await this.service.findAllAvailablesCopilots(null, null)
		const membershipPlanEnabled = command.forMembershipManagement
			? false
			: await this.membershipService.isMembershipAccessEnabled()
		const membershipAccess = membershipPlanEnabled ? await this.membershipService.findModelAccess() : null
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
					const models: ProviderModel[] = []
					if (customModels?.length) {
						models.push(
							...customModels.map(
								(model) =>
									({
										model: model.modelName,
										model_type: model.modelType,
										fetch_from: FetchFrom.CUSTOMIZABLE_MODEL,
										model_properties: model.modelProperties,
										features: customFeatures(model.modelProperties),
										label: {
											zh_Hans: model.modelName,
                                            en_US: model.modelName
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
					const selectedModel = selectedCopilotModelAsProviderModel(copilot.copilotModel, command.type)
					if (selectedModel && !models.some((_) => _.model === selectedModel.model)) {
						models.push(selectedModel)
					}

                    const visibleModels = !membershipPlanEnabled
							? models
							: membershipAccess
								? models.filter((model) =>
										this.membershipService.isModelAllowed(
											membershipAccess.membership.plan,
											copilot.modelProvider.providerName,
											model.model
										)
									)
								: []

					if (visibleModels.length) {
						const providerSchema = provider.getProviderSchema()
						const baseUrl = this.configService.get('baseUrl') as string
						copilotSchemas.push(
							new CopilotWithProviderDto({
								...copilot,
								modelProvider: new CopilotProviderPublicDto(copilot.modelProvider, baseUrl),
								providerWithModels: new ProviderWithModelsDto(
									{
										...providerSchema,
										models: visibleModels
									},
									baseUrl
								)
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

/**
 * Converts custom provider model properties into the feature flags consumed by
 * model selection and model synchronization.
 *
 * @todo move to PLUGINS level
 */
function customFeatures(modelProperties: Record<string, any>): string[] {
	const features: ModelFeature[] = []
	if (modelProperties?.vision_support === 'support') {
		features.push(ModelFeature.VISION)
	}
	if (modelProperties?.function_calling_type === 'tool_call') {
		features.push(ModelFeature.TOOL_CALL)
	}
	if (modelProperties?.function_calling_type === 'multi_tool_call') {
		features.push(ModelFeature.TOOL_CALL)
		features.push(ModelFeature.MULTI_TOOL_CALL)
	}
	if (modelProperties?.agent_though_support === 'supported') {
		features.push(ModelFeature.AGENT_THOUGHT)
	}
	return features
}

/**
 * Re-exposes the copilot's current selected model as a ProviderModel when that
 * model is not listed by built-in or custom provider model sources.
 */
function selectedCopilotModelAsProviderModel(
	copilotModel: { model?: string | null; modelType?: AiModelTypeEnum | string | null } | null | undefined,
	modelType: AiModelTypeEnum
): ProviderModel | null {
	const model = readString(copilotModel?.model)
	const selectedModelType = readString(copilotModel?.modelType) || AiModelTypeEnum.LLM
	if (!model || selectedModelType !== modelType) {
		return null
	}

	return {
		model,
		model_type: modelType,
		fetch_from: FetchFrom.CUSTOMIZABLE_MODEL,
		model_properties: {},
		features: [],
		label: {
			zh_Hans: model,
			en_US: model
		}
	}
}

/**
 * Normalizes optional string-like fields before model id comparisons.
 */
function readString(value: unknown) {
	return typeof value === 'string' ? value.trim() : ''
}
