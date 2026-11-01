import {
    configuredModelSource,
    DiscoveredModel,
    ICopilotProvider,
    isDiscoverableModelType,
    ModelDiscoveryItem,
    ModelDiscoveryResult,
    ModelImportInput,
    ModelImportResult,
    readModelConfiguration
} from '@xpert-ai/contracts'
import { IAIModelProviderStrategy, RequestContext } from '@xpert-ai/plugin-sdk'
import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common'
import { DataSource, IsNull } from 'typeorm'
import { t } from 'i18next'
import { AIProvidersService } from '../../ai-model'
import { CopilotProviderService } from '../copilot-provider.service'
import { CopilotProvider } from '../copilot-provider.entity'
import { CopilotProviderModel } from '../models/copilot-provider-model.entity'
import { snapshotEnabledModels } from '../models/enabled-models'

@Injectable()
export class ModelDiscoveryService {
    constructor(
        private readonly providers: CopilotProviderService,
        private readonly strategies: AIProvidersService,
        private readonly dataSource: DataSource
    ) {}

    async discover(providerId: string): Promise<ModelDiscoveryResult> {
        const { provider, discover } = await this.resolve(providerId)
        const models = await discover()
        const existing = await this.dataSource.getRepository(CopilotProviderModel).find({
            where: {
                providerId: provider.id,
                tenantId: provider.tenantId,
                organizationId: provider.organizationId ?? IsNull()
            }
        })
        const items: ModelDiscoveryItem[] = models.map((model) => {
            const saved = existing.find(
                (row) => row.modelProperties?.discovery_model_id === model.model || row.modelName === model.model
            )
            return saved
                ? configuredDiscoveryItem(model.model, saved, true)
                : {
                      ...model,
                      configured: false,
                      source: 'discovered',
                      available: true
                  }
        })
        const returned = new Set(models.map((model) => model.model))
        for (const saved of existing) {
            const sourceId = saved.modelProperties?.discovery_model_id
            if (sourceId && !returned.has(sourceId)) items.push(configuredDiscoveryItem(sourceId, saved, false))
        }
        return { models: items }
    }

    async importModels(providerId: string, input: ModelImportInput): Promise<ModelImportResult> {
        const { provider, strategy, discover } = await this.resolve(providerId)
        // Recheck availability and obtain adapter settings server-side, never accept credentials from the import UI.
        const discovered = new Map((await discover()).map((model) => [model.model, model]))
        const selected = input.models.map((selection) => {
            const model = discovered.get(selection.model)
            if (
                !model ||
                !strategy.getProviderSchema().supported_model_types.includes(selection.configuration.modelType)
            ) {
                throw new BadRequestException(t('server-ai:Error.ModelDiscoverySelectionInvalid'))
            }
            strategy.getModelManager(selection.configuration.modelType)
            return { model, configuration: selection.configuration }
        })

        return this.dataSource.transaction(async (manager) => {
            // Serialize imports for this provider across API replicas. Existing rows are never updated or deleted.
            const current = await manager.findOne(CopilotProvider, {
                where: {
                    id: provider.id,
                    tenantId: provider.tenantId,
                    organizationId: provider.organizationId ?? IsNull()
                },
                lock: { mode: 'pessimistic_write' }
            })
            if (!current) throw new ForbiddenException(t('server-ai:Error.ModelDiscoveryProviderScope'))
            const existing = await manager.find(CopilotProviderModel, {
                where: {
                    providerId: provider.id,
                    tenantId: provider.tenantId,
                    organizationId: provider.organizationId ?? IsNull()
                }
            })
            const configured = configuredModelIds(existing)
            const enabledModels = snapshotEnabledModels(current, strategy.getProviderModels() ?? [], existing)
            const additions: CopilotProviderModel[] = []
            for (const { model, configuration } of selected) {
                if (configured.has(model.model)) continue
                additions.push(
                    manager.create(CopilotProviderModel, {
                        providerId: provider.id,
                        providerName: provider.providerName,
                        tenantId: provider.tenantId,
                        organizationId: provider.organizationId,
                        modelName: model.model,
                        modelType: configuration.modelType,
                        modelProperties: {
                            ...model.modelProperties,
                            discovery_model_id: model.model,
                            configuration_source: 'discovered',
                            model_configuration: configuration
                        }
                    })
                )
                configured.add(model.model)
            }
            if (additions.length) await manager.save(CopilotProviderModel, additions)
            // Save scope and availability atomically with additions, without touching existing model settings.
            await manager.update(CopilotProvider, current.id, {
                options: {
                    ...current.options,
                    enabledModels,
                    modelDiscovery: {
                        mode: 'configured',
                        syncedAt: new Date().toISOString(),
                        availableModelIds: [...discovered.keys()]
                    }
                }
            })
            return { added: additions.length, skipped: selected.length - additions.length }
        })
    }

    private async resolve(providerId: string): Promise<{
        provider: ICopilotProvider
        strategy: IAIModelProviderStrategy
        discover: () => Promise<DiscoveredModel[]>
    }> {
        const provider = await this.providers.findOneInOrganizationOrTenant(providerId)
        if (
            provider.tenantId !== RequestContext.currentTenantId() ||
            (provider.organizationId ?? null) !== (RequestContext.getOrganizationId() ?? null)
        ) {
            throw new ForbiddenException(t('server-ai:Error.ModelDiscoveryProviderScope'))
        }
        const strategy: IAIModelProviderStrategy = this.strategies.getProvider(provider.providerName, true)
        if (!strategy.discoverModels) throw new BadRequestException(t('server-ai:Error.ModelDiscoveryUnsupported'))
        const discover = strategy.discoverModels.bind(strategy)
        return { provider, strategy, discover: () => discover(provider.credentials ?? {}) }
    }
}

function configuredModelIds(models: CopilotProviderModel[]): Set<string> {
    const ids = new Set<string>()
    for (const model of models) {
        ids.add(model.modelName)
        const sourceId: unknown = model.modelProperties?.discovery_model_id
        if (typeof sourceId === 'string') ids.add(sourceId)
    }
    return ids
}

function configuredDiscoveryItem(model: string, saved: CopilotProviderModel, available: boolean): ModelDiscoveryItem {
    return {
        model,
        label: saved.modelName,
        modelType: isDiscoverableModelType(saved.modelType) ? saved.modelType : null,
        typeSource: 'provider',
        configuration: readModelConfiguration(saved.modelProperties),
        configured: true,
        configuredModelId: saved.id,
        source: configuredModelSource(saved),
        available
    }
}
