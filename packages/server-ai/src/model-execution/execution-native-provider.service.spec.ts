import { AiModelTypeEnum, type ICopilotProviderModel, type ModelExecutionModel } from '@xpert-ai/contracts'
import { GetCopilotProviderModelQuery } from '../copilot-provider/queries/get-model.query'
import { CopilotGetOneQuery } from '../copilot/queries/get-one.query'
import { ModelExecutionNativeProviderService } from './execution-native-provider.service'

describe('native model provider binding', () => {
    function setup() {
        const model: ModelExecutionModel = {
            id: 'model-alias',
            copilotId: 'copilot',
            providerScopeId: 'credentials',
            providerOrganizationId: 'credential-org',
            provider: 'fixture',
            model: 'coding',
            modelType: AiModelTypeEnum.LLM,
            capabilities: [],
            protocols: ['openai_chat', 'openai_responses']
        }
        const copilot = {
            id: model.copilotId,
            tenantId: 'tenant',
            enabled: true,
            modelProvider: {
                id: model.providerScopeId,
                providerName: model.provider,
                organizationId: model.providerOrganizationId
            }
        }
        const client = { protocol: 'openai_responses', generate: jest.fn() }
        const provider = {
            getNativeModelClient: jest.fn().mockResolvedValue(client),
            getProviderModels: jest
                .fn()
                .mockReturnValue([{ model: model.model, native_protocols: ['openai_responses'] }])
        }
        const records: Pick<
            ICopilotProviderModel,
            'providerId' | 'tenantId' | 'organizationId' | 'modelName' | 'modelType' | 'isValid' | 'modelProperties'
        >[] = []
        const queries = {
            execute: jest.fn(async (query) => {
                if (query instanceof CopilotGetOneQuery) return copilot
                if (query instanceof GetCopilotProviderModelQuery) return records
                return provider
            })
        }
        return {
            model,
            copilot,
            provider,
            client,
            records,
            queries,
            service: new ModelExecutionNativeProviderService(queries as never)
        }
    }

    it('passes the authorized model and Copilot to the provider-owned client factory', async () => {
        const test = setup()
        await expect(test.service.client('tenant', test.model, 'openai_responses')).resolves.toBe(test.client)
        expect(test.provider.getNativeModelClient).toHaveBeenCalledWith('openai_responses', {
            copilotId: test.model.copilotId,
            copilot: test.copilot,
            model: test.model.model,
            modelType: AiModelTypeEnum.LLM
        })
        expect(test.client.generate).not.toHaveBeenCalled()
    })

    it.each(['tenant', 'copilot', 'credentials', 'credential-org', 'provider', 'disabled'])(
        'rejects a changed %s binding before requesting a client',
        async (field) => {
            const test = setup()
            if (field === 'tenant') test.copilot.tenantId = 'other'
            if (field === 'copilot') test.copilot.id = 'other'
            if (field === 'credentials') test.copilot.modelProvider.id = 'other'
            if (field === 'credential-org') test.copilot.modelProvider.organizationId = 'other'
            if (field === 'provider') test.copilot.modelProvider.providerName = 'other'
            if (field === 'disabled') test.copilot.enabled = false
            await expect(test.service.client('tenant', test.model, 'openai_responses')).rejects.toThrow()
            expect(test.provider.getNativeModelClient).not.toHaveBeenCalled()
        }
    )

    it('requires explicit protocol support in the provider catalog', async () => {
        const test = setup()
        test.provider.getProviderModels.mockReturnValue([{ model: test.model.model, native_protocols: [] }])
        await expect(test.service.client('tenant', test.model, 'openai_responses')).rejects.toThrow()
        expect(test.provider.getNativeModelClient).not.toHaveBeenCalled()
    })

    it('rejects a client for a different protocol', async () => {
        const test = setup()
        test.client.protocol = 'anthropic_messages'
        await expect(test.service.client('tenant', test.model, 'openai_responses')).rejects.toThrow()
    })

    it('resolves custom protocol metadata and credentials from the same scoped record', async () => {
        const test = setup()
        const properties = { api_protocol: 'responses', api_key: 'server-only', context_size: 32768 }
        test.records.push({
            providerId: test.model.providerScopeId,
            tenantId: 'tenant',
            organizationId: 'credential-org',
            modelName: 'coding',
            modelType: AiModelTypeEnum.LLM,
            isValid: true,
            modelProperties: properties
        })
        const getModelSchema = jest.fn(() => ({
            native_protocols: ['openai_responses'],
            model_properties: { context_size: 32768 },
            parameter_rules: [{ name: 'max_tokens', max: 8192 }]
        }))
        Object.assign(test.provider, { getModelManager: () => ({ getModelSchema }) })
        await expect(test.service.metadata('fixture', 'coding', test.copilot as never)).resolves.toEqual({
            protocols: ['openai_responses'],
            contextWindow: 32768,
            outputTokenLimit: 8192
        })
        await test.service.client('tenant', test.model, 'openai_responses')
        expect(getModelSchema).toHaveBeenCalledWith('coding', properties)
        expect(test.provider.getNativeModelClient).toHaveBeenCalledWith(
            'openai_responses',
            expect.objectContaining({ model: 'coding' }),
            { modelProperties: properties }
        )
    })

    it.each(['providerId', 'tenantId', 'organizationId', 'modelName', 'modelType', 'isValid'])(
        'rejects a custom record with a changed %s',
        async (field) => {
            const test = setup()
            const record = {
                providerId: 'credentials',
                tenantId: 'tenant',
                organizationId: 'credential-org',
                modelName: 'coding',
                modelType: AiModelTypeEnum.LLM,
                isValid: true,
                modelProperties: {}
            }
            test.records.push({ ...record, [field]: field === 'isValid' ? false : 'other' })
            await expect(test.service.client('tenant', test.model, 'openai_responses')).rejects.toThrow()
            expect(test.provider.getNativeModelClient).not.toHaveBeenCalled()
        }
    )
})

it('reads a context hint independently of native protocol support', async () => {
    const getModelSchema = jest.fn((model: string) =>
        model === 'coding' ? { parameter_rules: [{ name: 'max_tokens', max: 65536 }] } : null
    )
    const provider = {
        getProviderModels: jest.fn(() => [{ model: 'coding', model_properties: { context_size: 1000000 } }]),
        getModelManager: () => ({ getModelSchema })
    }
    const service = new ModelExecutionNativeProviderService({ execute: jest.fn(async () => provider) } as never)
    await expect(service.metadata('fixture', 'coding')).resolves.toEqual({
        protocols: [],
        contextWindow: 1000000,
        outputTokenLimit: 65536
    })
    await expect(service.metadata('fixture', 'unknown')).resolves.toEqual({ protocols: [] })
    // Empty credentials can trigger custom-model defaults instead of catalog metadata.
    expect(getModelSchema.mock.calls).toEqual([['coding'], ['unknown']])
})
