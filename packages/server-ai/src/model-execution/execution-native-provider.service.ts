import { Injectable } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import {
    AiModelTypeEnum,
    ICopilot,
    ICopilotProviderModel,
    ModelExecutionModel,
    isOutputTokenParameter,
    isConfiguredModelAvailable
} from '@xpert-ai/contracts'
import { IAIModelProviderStrategy, NativeModelProtocol } from '@xpert-ai/plugin-sdk'
import { AIModelGetProviderQuery } from '../ai-model/queries/get-provider.query'
import { CopilotGetOneQuery } from '../copilot/queries/get-one.query'
import { GetCopilotProviderModelQuery } from '../copilot-provider/queries/get-model.query'
import { executionError } from './execution-errors'

// Protocol metadata and credentials come from the same scoped model record.
// Credentials remain server-side; a declared protocol requires an implemented client.
@Injectable()
export class ModelExecutionNativeProviderService {
    constructor(private readonly queries: QueryBus) {}
    private async properties(copilot: ICopilot, model: string, modelType: AiModelTypeEnum) {
        const records = await this.queries.execute<GetCopilotProviderModelQuery, ICopilotProviderModel[]>(
            new GetCopilotProviderModelQuery(copilot.modelProvider.id, { modelName: model, modelType })
        )
        const record = records.find(
            (item) =>
                item.providerId === copilot.modelProvider.id &&
                item.modelName === model &&
                item.modelType === modelType &&
                item.tenantId === copilot.tenantId &&
                (item.organizationId ?? null) === (copilot.modelProvider.organizationId ?? null)
        )
        if (records.length && !record) throw executionError('Denied')
        if (record?.isValid === false || !isConfiguredModelAvailable(copilot.modelProvider, record))
            throw executionError('Model')
        return record?.modelProperties
    }

    async metadata(providerName: string, model: string, copilot?: ICopilot) {
        if (copilot && copilot.modelProvider?.providerName !== providerName) throw executionError('Denied')
        const provider = await this.queries.execute<AIModelGetProviderQuery, IAIModelProviderStrategy>(
            new AIModelGetProviderQuery(providerName)
        )
        const properties = copilot ? await this.properties(copilot, model, AiModelTypeEnum.LLM) : undefined
        const manager = provider?.getModelManager?.(AiModelTypeEnum.LLM)
        const schema = properties ? manager?.getModelSchema(model, properties) : manager?.getModelSchema(model)
        const entry =
            schema ??
            (!properties
                ? provider?.getProviderModels(AiModelTypeEnum.LLM).find((entry) => entry.model === model)
                : undefined)
        const contextWindow =
            entry?.model_properties?.context_size ??
            (!properties
                ? provider?.getProviderModels(AiModelTypeEnum.LLM).find((entry) => entry.model === model)
                      ?.model_properties?.context_size
                : undefined)
        const outputTokenLimit = schema?.parameter_rules?.find(isOutputTokenParameter)?.max
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
        const properties = await this.properties(copilot, model.model, model.modelType)
        const manager = provider?.getModelManager?.(model.modelType)
        const schema = properties
            ? manager?.getModelSchema(model.model, properties)
            : manager?.getModelSchema(model.model)
        const entry =
            schema ??
            (!properties
                ? provider?.getProviderModels(model.modelType).find((entry) => entry.model === model.model)
                : undefined)
        if (!provider?.getNativeModelClient || !entry?.native_protocols?.includes(protocol))
            throw executionError('Model')
        const selected = {
            copilotId: copilot.id,
            copilot,
            model: model.model,
            modelType: model.modelType
        }
        const client = properties
            ? await provider.getNativeModelClient(protocol, selected, { modelProperties: properties })
            : await provider.getNativeModelClient(protocol, selected)
        if (client.protocol !== protocol) throw executionError('Model')
        return client
    }
}
