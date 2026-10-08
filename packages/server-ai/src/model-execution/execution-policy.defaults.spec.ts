import { defaultExecutionGatewayUrl } from './execution-policy.defaults'
import { executionToolModels } from './execution-tool-model'
import { parseExecutionPolicy } from './execution-policy'
import { AiModelTypeEnum, ModelFeature, ModelExecutionModel } from '@xpert-ai/contracts'

describe('zero-configuration CLI access', () => {
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
})
