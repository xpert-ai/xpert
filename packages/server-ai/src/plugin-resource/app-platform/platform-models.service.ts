import { platformFailure } from './platform-error'
import { Injectable } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import {
    AiModelTypeEnum,
    AiProviderRole,
    AppPlatformEnvironment,
    TCopilotModel,
    XpertToolsetCategoryEnum
} from '@xpert-ai/contracts'
import { IAIModelProviderStrategy } from '@xpert-ai/plugin-sdk'
import { DataSource, IsNull } from 'typeorm'
import { Copilot } from '../../copilot/copilot.entity'
import { XpertToolset } from '../../xpert-toolset/xpert-toolset.entity'
import { AIModelGetProviderQuery } from '../../ai-model/queries/get-provider.query'

export type PlatformModels = {
    primary: TCopilotModel
    auxiliary: TCopilotModel[]
    embeddingModelId?: string
    visionModelId?: string
    speechToTextModelId?: string
    billingModels: Array<TCopilotModel & { provider: string }>
}

@Injectable()
export class PlatformModelsService {
    constructor(
        private readonly database: DataSource,
        private readonly queries: QueryBus
    ) {}

    async resolve(
        tenantId: string,
        organizationId: string,
        config: AppPlatformEnvironment['configurations'][string]
    ): Promise<PlatformModels> {
        const copilots = await this.database.getRepository(Copilot).find({
            where: [
                { tenantId, organizationId, enabled: true },
                { tenantId, organizationId: IsNull(), enabled: true }
            ],
            relations: ['modelProvider']
        })
        const selected: Array<{ copilot: Copilot; model: TCopilotModel }> = []
        const resolve = (binding: typeof config.primary, modelType: AiModelTypeEnum) => {
            const role =
                binding.role ??
                (modelType === AiModelTypeEnum.TEXT_EMBEDDING ? AiProviderRole.Embedding : AiProviderRole.Primary)
            const candidates = copilots.filter(
                (copilot) =>
                    copilot.role === role &&
                    copilot.modelProvider?.providerName === binding.provider &&
                    copilot.modelProvider.isValid !== false
            )
            const scoped = candidates.filter((copilot) => copilot.organizationId === organizationId)
            const available = scoped.length ? scoped : candidates
            if (available.length !== 1) throw platformFailure('application_model_binding_unavailable')
            const model = { copilotId: available[0].id, model: binding.model, modelType }
            selected.push({ copilot: available[0], model })
            return model
        }
        const option = (binding: typeof config.primary, modelType: AiModelTypeEnum) => {
            const model = resolve(binding, modelType)
            return `${model.copilotId}/${encodeURIComponent(model.model)}`
        }
        const resolved = {
            primary: resolve(config.primary, AiModelTypeEnum.LLM),
            auxiliary: config.auxiliaryModels.map((binding) => resolve(binding, binding.modelType)),
            ...(config.embedding ? { embeddingModelId: option(config.embedding, AiModelTypeEnum.TEXT_EMBEDDING) } : {}),
            ...(config.vision ? { visionModelId: option(config.vision, AiModelTypeEnum.LLM) } : {}),
            ...(config.speechToText
                ? { speechToTextModelId: option(config.speechToText, AiModelTypeEnum.SPEECH2TEXT) }
                : {})
        }
        for (const { copilot, model } of selected) {
            const provider = await this.queries.execute<AIModelGetProviderQuery, IAIModelProviderStrategy>(
                new AIModelGetProviderQuery(copilot.modelProvider.providerName)
            )
            const manager = provider?.getModelManager(model.modelType)
            if (!manager) throw platformFailure('application_model_binding_unavailable')
        }
        return {
            ...resolved,
            billingModels: selected.map(({ copilot, model }) => ({
                ...model,
                provider: copilot.modelProvider.providerName
            }))
        }
    }

    async toolSources(tenantId: string, config: AppPlatformEnvironment['configurations'][string]) {
        const ids: string[] = []
        for (const binding of config.tools ?? []) {
            const sources = await this.database.getRepository(XpertToolset).find({
                where: {
                    tenantId,
                    organizationId: IsNull(),
                    workspaceId: IsNull(),
                    category: XpertToolsetCategoryEnum.BUILTIN,
                    type: binding.provider,
                    name: binding.sourceName
                },
                take: 2
            })
            if (sources.length !== 1) throw platformFailure('application_tool_binding_unavailable')
            ids.push(sources[0].id)
        }
        return ids
    }
}
