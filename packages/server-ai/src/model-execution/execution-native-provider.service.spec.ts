import { AiModelTypeEnum, type ModelExecutionModel } from '@xpert-ai/contracts'
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
        const queries = { execute: jest.fn().mockResolvedValueOnce(copilot).mockResolvedValue(provider) }
        return { model, copilot, provider, client, service: new ModelExecutionNativeProviderService(queries as never) }
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
