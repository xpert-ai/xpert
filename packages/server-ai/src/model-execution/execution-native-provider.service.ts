import { Injectable } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { AiModelTypeEnum, ICopilot, ModelExecutionModel, isOutputTokenParameter } from '@xpert-ai/contracts'
import { IAIModelProviderStrategy, NativeModelProtocol } from '@xpert-ai/plugin-sdk'
import { AIModelGetProviderQuery } from '../ai-model/queries/get-provider.query'
import { CopilotGetOneQuery } from '../copilot/queries/get-one.query'
import { executionError } from './execution-errors'

@Injectable()
export class ModelExecutionNativeProviderService {
    constructor(private readonly queries: QueryBus) {}
    async metadata(providerName: string, model: string) {
        const provider = await this.queries.execute<AIModelGetProviderQuery, IAIModelProviderStrategy>(
            new AIModelGetProviderQuery(providerName)
        )
        const entry = provider?.getProviderModels(AiModelTypeEnum.LLM).find((entry) => entry.model === model)
        const contextWindow = entry?.model_properties?.context_size
        const outputTokenLimit = provider
            ?.getModelManager?.(AiModelTypeEnum.LLM)
            ?.getModelSchema(model)
            ?.parameter_rules?.find(isOutputTokenParameter)?.max
        return {
            protocols: provider?.getNativeModelClient ? (entry?.native_protocols ?? []) : [],
            ...(Number.isSafeInteger(contextWindow) && contextWindow > 0 ? { contextWindow } : {}),
            ...(Number.isSafeInteger(outputTokenLimit) && outputTokenLimit > 0 ? { outputTokenLimit } : {})
        }
    }
    async client(tenantId: string, model: ModelExecutionModel, protocol: NativeModelProtocol) {
        const copilot = await this.queries.execute<CopilotGetOneQuery, ICopilot>(
            new CopilotGetOneQuery(tenantId, model.copilotId, ['modelProvider'])
        )
        if (
            !copilot?.enabled ||
            copilot.tenantId !== tenantId ||
            copilot.id !== model.copilotId ||
            copilot.modelProvider?.id !== model.providerScopeId ||
            copilot.modelProvider.providerName !== model.provider ||
            (copilot.modelProvider.organizationId ?? null) !== model.providerOrganizationId
        )
            throw executionError('Denied')
        const provider = await this.queries.execute<AIModelGetProviderQuery, IAIModelProviderStrategy>(
            new AIModelGetProviderQuery(model.provider)
        )
        if (
            !provider?.getNativeModelClient ||
            !provider
                .getProviderModels(AiModelTypeEnum.LLM)
                .some((entry) => entry.model === model.model && entry.native_protocols?.includes(protocol))
        )
            throw executionError('Model')
        const client = await provider.getNativeModelClient(protocol, {
            copilotId: copilot.id,
            copilot,
            model: model.model,
            modelType: model.modelType
        })
        if (client.protocol !== protocol) throw executionError('Model')
        return client
    }
}
