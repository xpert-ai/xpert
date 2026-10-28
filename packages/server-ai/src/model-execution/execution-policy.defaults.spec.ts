import { defaultExecutionGatewayUrl } from './execution-policy.defaults'
import { executionToolModels } from './execution-tool-model'
import { parseExecutionPolicy } from './execution-policy'
import { AiModelTypeEnum, ModelFeature, ModelExecutionModel } from '@xpert-ai/contracts'

describe('zero-configuration CLI access', () => {
    const codex = { id: 'codex', version: '0.159.2' }
    const responsesModel: ModelExecutionModel = {
        id: 'model',
        copilotId: 'copilot',
        providerScopeId: 'provider',
        providerOrganizationId: null,
        provider: 'provider',
        model: 'model',
        modelType: AiModelTypeEnum.LLM,
        capabilities: [ModelFeature.STREAM_TOOL_CALL, ModelFeature.MULTI_TOOL_CALL],
        protocols: ['openai_chat', 'openai_responses']
    }
    const original = process.env.API_BASE_URL
    afterEach(() => {
        if (original === undefined) delete process.env.API_BASE_URL
        else process.env.API_BASE_URL = original
    })
    it('uses the local API when no base URL is configured', () => {
        delete process.env.API_BASE_URL
        expect(parseExecutionPolicy(undefined).gatewayBaseUrl).toBe(
            'http://host.docker.internal:3000/api/model-execution/openai/v1'
        )
    })
    it.each([
        'not-a-url',
        'ftp://api.example.test',
        'https://user:secret@api.example.test',
        'https://api.example.test?key=secret'
    ])('rejects an invalid default gateway from %s while allowing an explicit override', (value) => {
        process.env.API_BASE_URL = value
        expect(() => parseExecutionPolicy(undefined)).toThrow()
        const gatewayBaseUrl = 'https://gateway.example.test/api/model-execution/openai/v1'
        expect(parseExecutionPolicy({ gatewayBaseUrl }).gatewayBaseUrl).toBe(gatewayBaseUrl)
    })
    it.each([
        ['http://localhost:3000', 'http://host.docker.internal:3000/api/model-execution/openai/v1'],
        ['http://127.0.0.1:3001/', 'http://host.docker.internal:3001/api/model-execution/openai/v1'],
        ['http://[::1]:3000', 'http://host.docker.internal:3000/api/model-execution/openai/v1'],
        ['https://api.example.test', 'https://api.example.test/api/model-execution/openai/v1'],
        ['http://api:3000/api/', 'http://api:3000/api/model-execution/openai/v1'],
        ['https://host.example.test/xpert', 'https://host.example.test/xpert/api/model-execution/openai/v1']
    ])('resolves a guest-reachable gateway from %s', (input, output) => {
        process.env.API_BASE_URL = input
        expect(defaultExecutionGatewayUrl()).toBe(output)
    })
    it('qualifies bundled tools without tenant setup but preserves version and model checks', () => {
        const policy = parseExecutionPolicy(undefined)
        const model: ModelExecutionModel = {
            id: 'model',
            copilotId: 'copilot',
            providerScopeId: 'provider',
            providerOrganizationId: null,
            provider: 'provider',
            model: 'model',
            modelType: AiModelTypeEnum.LLM,
            capabilities: [ModelFeature.STREAM_TOOL_CALL, ModelFeature.MULTI_TOOL_CALL],
            protocols: ['openai_chat']
        }
        for (const tool of policy.tools) {
            expect(executionToolModels([model], tool, policy)).toHaveLength(1)
            expect(executionToolModels([model], { ...tool, version: '0.0.0' }, policy)).toEqual([])
        }
        expect(executionToolModels([{ ...model, capabilities: [] }], policy.tools[0], policy)).toEqual([])
    })
    it('selects native Responses only when the model declares support', () => {
        const policy = parseExecutionPolicy(undefined)
        expect(executionToolModels([responsesModel], codex, policy)[0].protocols).toEqual([
            'openai_chat',
            'openai_responses'
        ])
        expect(
            executionToolModels([{ ...responsesModel, protocols: ['openai_chat'] }], codex, policy)[0].protocols
        ).toEqual(['openai_chat', 'openai_responses_chat'])
        expect(
            executionToolModels([{ ...responsesModel, protocols: ['openai_chat'], capabilities: [] }], codex, policy)
        ).toEqual([])
        expect(executionToolModels([responsesModel], { ...codex, version: '0.0.0' }, policy)).toEqual([])
    })
    it.each([{ nativeProtocols: [] }, { nativeProtocols: ['anthropic_messages'] }])(
        'preserves explicit Responses restrictions: %j',
        (settings) => {
            expect(executionToolModels([responsesModel], codex, parseExecutionPolicy(settings))[0].protocols).toEqual([
                'openai_chat',
                'openai_responses_chat'
            ])
            expect(
                executionToolModels(
                    [responsesModel],
                    codex,
                    parseExecutionPolicy({ ...settings, chatBridgeProtocols: [] })
                )
            ).toEqual([])
        }
    )
    it('keeps native Messages opt-in while retaining its qualified Chat bridge', () => {
        const models: ModelExecutionModel[] = [{ ...responsesModel, protocols: ['openai_chat', 'anthropic_messages'] }]
        const claude = { id: 'claude', version: '2.1.63' }
        expect(executionToolModels(models, claude, parseExecutionPolicy(undefined))[0].protocols).toEqual([
            'openai_chat',
            'anthropic_messages_chat'
        ])
        expect(
            executionToolModels(models, claude, parseExecutionPolicy({ nativeProtocols: ['anthropic_messages'] }))[0]
                .protocols
        ).toEqual(['openai_chat', 'anthropic_messages'])
    })
})
