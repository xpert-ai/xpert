import { AiModelTypeEnum, FetchFrom, ICopilotProviderModel, ModelFeature, ProviderModel } from '@xpert-ai/contracts'
import { ConfigService } from '@xpert-ai/server-config'
import { RequestContext } from '@xpert-ai/server-core'
import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { Inject } from '@nestjs/common'
import { AIProvidersService } from '../../../ai-model/index'
import { GetCopilotProviderModelQuery } from '../../../copilot-provider'
import { CopilotService } from '../../copilot.service'
import { CopilotWithProviderDto, ProviderWithModelsDto } from '../../dto'
import { CopilotModelCatalogMode, FindCopilotModelsQuery } from '../copilot-model-find.query'
import { CopilotProviderPublicDto } from '../../../copilot-provider/dto'
import { ModelAccessService } from '../../../model-access'

/**
 * Builds the LLM/model catalog visible to the current tenant and organization.
 * It combines provider built-ins, provider custom model records, and the
 * copilot's already-selected model according to the requested catalog mode.
 */
@QueryHandler(FindCopilotModelsQuery)
export class FindCopilotModelsHandler implements IQueryHandler<FindCopilotModelsQuery> {
    @Inject(ConfigService)
    private readonly configService: ConfigService

    constructor(
        private readonly queryBus: QueryBus,
        private readonly service: CopilotService,
        private readonly providersService: AIProvidersService,
        private readonly modelAccessService: ModelAccessService
    ) {}

    /**
     * Returns visible copilots with their provider metadata and available models
     * for the requested model type.
     */
    public async execute(command: FindCopilotModelsQuery): Promise<CopilotWithProviderDto[]> {
        const tenantId = RequestContext.currentTenantId()
        const organizationId = RequestContext.getOrganizationId()
        const managementCopilots = await this.service.findAllEnabledCopilotsWithoutMembership(tenantId, organizationId)
        const copilots =
            command.catalogMode === CopilotModelCatalogMode.MembershipManagement
                ? managementCopilots.filter(
                      (copilot) =>
                          (copilot.organizationId ?? null) === (organizationId ?? null) &&
                          copilot.copilotModel?.modelType === command.type
                  )
                : managementCopilots
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
                    >(new GetCopilotProviderModelQuery(copilot.modelProvider.id, { modelType: command.type }))
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

                    if (models.length) {
                        const providerSchema = provider.getProviderSchema()
                        const baseUrl = this.configService.get('baseUrl') as string
                        copilotSchemas.push(
                            new CopilotWithProviderDto({
                                ...copilot,
                                modelProvider: new CopilotProviderPublicDto(copilot.modelProvider, baseUrl),
                                providerWithModels: new ProviderWithModelsDto(
                                    {
                                        ...providerSchema,
                                        models
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

        return command.catalogMode === CopilotModelCatalogMode.Available
            ? this.filterAvailableCopilots(copilotSchemas, tenantId, organizationId, command.type, command.accessUserId)
            : copilotSchemas
    }

    private async filterAvailableCopilots(
        copilots: CopilotWithProviderDto[],
        tenantId: string,
        organizationId: string | null,
        modelType: AiModelTypeEnum,
        accessUserId?: string | null
    ) {
        const userId = accessUserId ?? RequestContext.currentUserId()
        if (!userId) {
            return []
        }
        const models = copilots.flatMap((copilot) =>
            copilot.providerWithModels.models.map((model) => ({
                copilotId: copilot.id,
                copilotModelId: model.model,
                modelType
            }))
        )
        if (!models.length) {
            return []
        }
        const availability = await this.modelAccessService.canUseCatalogModels({
            tenantId,
            organizationId,
            userId,
            models
        })
        let index = 0
        for (const copilot of copilots) {
            copilot.providerWithModels.models = copilot.providerWithModels.models.filter(
                () => availability[index++] === true
            )
        }
        return copilots.filter((copilot) => copilot.providerWithModels.models.length)
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
    const selectedModelType = readString(copilotModel?.modelType)
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
