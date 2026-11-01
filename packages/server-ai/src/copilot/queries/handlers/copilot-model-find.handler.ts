import { DEFAULT_MODEL_DEFINITIONS } from '@xpert-ai/contracts'
import {
    AiModelTypeEnum,
    FetchFrom,
    ICopilotProviderModel,
    ProviderModel,
    isConfiguredModelAvailable,
    usesConfiguredModelCatalog,
    readModelConfiguration,
    legacyModelFeatures,
    isProviderModelEnabled
} from '@xpert-ai/contracts'
import { ConfigService } from '@xpert-ai/server-config'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { IQueryHandler, QueryBus, QueryHandler } from '@nestjs/cqrs'
import { Inject } from '@nestjs/common'
import { AIProvidersService } from '../../../ai-model/index'
import { GetCopilotProviderModelQuery } from '../../../copilot-provider'
import { CopilotService } from '../../copilot.service'
import { CopilotWithProviderDto, ProviderWithModelsDto } from '../../dto'
import { CopilotModelCatalogMode, FindCopilotModelsQuery } from '../copilot-model-find.query'
import { CopilotProviderPublicDto } from '../../../copilot-provider/dto'
import { ModelAccessService } from '../../../model-access'
import { CopilotRoleDefaultService } from '../../role-defaults/role-default.service'

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
        private readonly modelAccessService: ModelAccessService,
        private readonly roleDefaults: CopilotRoleDefaultService
    ) {}

    /**
     * Returns visible copilots with their provider metadata and available models
     * for the requested model type.
     */
    public async execute(command: FindCopilotModelsQuery): Promise<CopilotWithProviderDto[]> {
        const tenantId = RequestContext.currentTenantId()
        const organizationId = RequestContext.getOrganizationId()
        const managementCopilots = await this.service.findAllEnabledCopilotsWithoutMembership(tenantId, organizationId)
        const membershipCatalog = command.catalogMode === CopilotModelCatalogMode.MembershipManagement
        // A Copilot role selects a default use, not the provider's complete capability set.
        const copilots = membershipCatalog
            ? managementCopilots.filter(
                  (copilot) =>
                      (copilot.organizationId ?? null) === (organizationId ?? null) &&
                      copilot.enabled === true &&
                      copilot.modelProvider?.isValid !== false
              )
            : managementCopilots
        const copilotSchemas: CopilotWithProviderDto[] = []
        for (const copilot of copilots) {
            if (copilot.modelProvider) {
                const provider = this.providersService.getProvider(copilot.modelProvider.providerName)
                if (provider) {
                    // Predefined models
                    const configuredOnly = usesConfiguredModelCatalog(copilot.modelProvider)
                    // Even configured-only catalogs need built-in deprecation metadata used by runtime access.
                    const providerModels =
                        configuredOnly && !membershipCatalog ? [] : (provider.getProviderModels(command.type) ?? [])
                    const predefinedModels = configuredOnly ? [] : providerModels
                    // Custom models
                    const customModels = await this.queryBus.execute<
                        GetCopilotProviderModelQuery,
                        ICopilotProviderModel[]
                    >(new GetCopilotProviderModelQuery(copilot.modelProvider.id, { modelType: command.type }))
                    const models: ProviderModel[] = []
                    if (customModels?.length) {
                        models.push(
                            ...customModels
                                .filter(
                                    (model) =>
                                        isProviderModelEnabled(copilot.modelProvider, {
                                            model: model.modelName,
                                            modelType: model.modelType
                                        }) &&
                                        isConfiguredModelAvailable(copilot.modelProvider, model) &&
                                        (!membershipCatalog ||
                                            (model.isValid !== false &&
                                                !providerModels.some(
                                                    (predefined) =>
                                                        predefined.model === model.modelName &&
                                                        predefined.model_type === model.modelType &&
                                                        predefined.deprecated
                                                )))
                                )
                                .map((model) => {
                                    const configuration = readModelConfiguration(model.modelProperties)
                                    const schema = configuration
                                        ? provider
                                              .getModelManager(model.modelType)
                                              .getModelSchema(model.modelName, model.modelProperties)
                                        : null
                                    return {
                                        model: model.modelName,
                                        model_type: model.modelType,
                                        fetch_from: FetchFrom.CUSTOMIZABLE_MODEL,
                                        model_properties: schema?.model_properties ?? model.modelProperties,
                                        features:
                                            configuration?.modelType === AiModelTypeEnum.LLM
                                                ? configuration.features
                                                : (schema?.features ?? legacyModelFeatures(model.modelProperties)),
                                        label: {
                                            zh_Hans: model.modelName,
                                            en_US: model.modelName
                                        }
                                    } as ProviderModel
                                })
                        )
                    }

                    predefinedModels?.forEach((model) => {
                        if (
                            !isProviderModelEnabled(copilot.modelProvider, {
                                model: model.model,
                                modelType: model.model_type
                            })
                        )
                            return
                        if (
                            membershipCatalog &&
                            (model.deprecated ||
                                customModels?.some(
                                    (custom) =>
                                        custom.modelName === model.model &&
                                        custom.modelType === model.model_type &&
                                        custom.isValid === false
                                ))
                        ) {
                            return
                        }
                        if (!models.some((_) => _.model === model.model && _.model_type === model.model_type)) {
                            models.push(model)
                        }
                    })
                    // Saved selections are references, not model definitions. A renamed/deleted
                    // selection must remain unavailable until the user explicitly selects a valid model.

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

        for (const { role } of DEFAULT_MODEL_DEFINITIONS) {
            const resolved = await this.roleDefaults.resolve(tenantId, organizationId ?? null, role)
            for (const entry of copilotSchemas) {
                entry.configuredDefaultRoles = [...(entry.configuredDefaultRoles ?? []), role]
                if (resolved.binding?.copilotId === entry.id) {
                    entry.defaultModels = { ...entry.defaultModels, [role]: { ...resolved.binding } }
                }
            }
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
