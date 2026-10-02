import { AiModelTypeEnum, ModelFeature, type ModelExecutionModel, type ModelExecutionPolicy } from '@xpert-ai/contracts'
import { executionToolModels } from './execution-tool-model'
import { parseExecutionPolicy } from './execution-policy'
const aider = { id: 'aider', version: '1.0.0' }
const opencode = { id: 'opencode', version: '1.0.0' }
const codex = { id: 'codex', version: '0.159.2' }
const claude = { id: 'claude', version: '2.1.63' }
const testPolicy = {
    enabled: true,
    gatewayBaseUrl: 'https://gateway.test/api/model-execution/openai/v1',
    limits: {
        tokenBudget: 1000,
        userTokenBudget: 2000,
        maxInputTokens: 100,
        maxOutputTokens: 50,
        maxConcurrentRequests: 1,
        requestsPerMinute: 10,
        leaseSeconds: 60,
        maxDurationSeconds: 600
    },
    tools: [{ id: 'aider', executable: '/home/user/aider', version: '1.0.0' }]
}

const model: ModelExecutionModel = {
    id: 'selected',
    copilotId: 'copilot',
    providerScopeId: 'provider',
    providerOrganizationId: null,
    provider: 'explicit',
    model: 'configured',
    modelType: AiModelTypeEnum.LLM,
    capabilities: [ModelFeature.STREAM_TOOL_CALL, ModelFeature.MULTI_TOOL_CALL],
    protocols: ['openai_chat', 'openai_responses']
}
testPolicy.tools.push({ id: 'codex', executable: '/home/user/codex', version: '0.159.2' })
testPolicy.tools.push({ ...opencode, executable: '/opencode' }, { ...claude, executable: '/claude' })
const policy = parseExecutionPolicy(testPolicy) as Extract<ModelExecutionPolicy, { enabled: true }>
describe('tool capability admission', () => {
    it('requires explicit native protocol enablement in addition to the provider catalog', () => {
        expect(executionToolModels([model], codex, policy)).toEqual([])
        expect(executionToolModels([model], codex, { ...policy, nativeProtocols: ['openai_responses'] })).toHaveLength(
            1
        )
        expect(executionToolModels([model], claude, { ...policy, nativeProtocols: ['anthropic_messages'] })).toEqual([])
    })
    it('rejects OpenCode without streaming tool calls while leaving plain chat available to Aider', () => {
        expect(executionToolModels([{ ...model, capabilities: [] }], opencode, policy)).toEqual([])
        expect(executionToolModels([{ ...model, capabilities: [] }], aider, policy)).toHaveLength(1)
    })
})

it('requires a separate bridge opt-in and streaming client-tool support', () => {
    const chat = { ...model, protocols: ['openai_chat'] as const }
    const available = { ...chat, protocols: [...chat.protocols] }
    expect(executionToolModels([available], codex, policy)).toEqual([])
    const bridged = executionToolModels([available], codex, { ...policy, chatBridgeProtocols: ['openai_responses'] })
    expect(bridged[0].protocols).toEqual(['openai_chat', 'openai_responses_chat'])
    expect(
        executionToolModels([{ ...available, capabilities: [] }], codex, {
            ...policy,
            chatBridgeProtocols: ['openai_responses']
        })
    ).toEqual([])
})
it('pins native transport when both are enabled; no native-to-chat fallback', () => {
    expect(
        executionToolModels([model], codex, {
            ...policy,
            nativeProtocols: ['openai_responses'],
            chatBridgeProtocols: ['openai_responses']
        })[0].protocols
    ).toEqual(['openai_chat', 'openai_responses'])
})

it('does not advertise an unqualified CLI version or a Codex model without parallel tools', () => {
    const settings = { ...policy, chatBridgeProtocols: ['openai_responses'] as const }
    const configured = { ...settings, chatBridgeProtocols: [...settings.chatBridgeProtocols] }
    expect(
        executionToolModels(
            [model],
            { ...codex, version: '0.159.3' },
            {
                ...configured,
                tools: [{ id: 'codex', executable: '/codex', version: '0.159.3' }]
            }
        )
    ).toEqual([])
    expect(
        executionToolModels([{ ...model, capabilities: [ModelFeature.STREAM_TOOL_CALL] }], codex, configured)
    ).toEqual([])
})

it('does not qualify a new CLI version using another version in the same policy', () => {
    const configured = {
        ...policy,
        chatBridgeProtocols: ['openai_responses'] as const,
        tools: [
            { id: 'codex' as const, executable: '/codex-new', version: '0.159.3' },
            { id: 'codex' as const, executable: '/codex-qualified', version: '0.159.2' }
        ]
    }
    // Both versions are permitted to launch, but only 0.159.2 has bridge acceptance.
    expect(
        executionToolModels(
            [model],
            { ...codex, version: '0.159.3' },
            {
                ...configured,
                chatBridgeProtocols: [...configured.chatBridgeProtocols]
            }
        )
    ).toEqual([])
    expect(
        executionToolModels([model], codex, {
            ...configured,
            chatBridgeProtocols: [...configured.chatBridgeProtocols]
        })
    ).toHaveLength(1)
})

it('requires the exact configured version even for a qualified bridge client', () => {
    expect(
        executionToolModels([model], codex, {
            ...policy,
            chatBridgeProtocols: ['openai_responses'],
            tools: []
        })
    ).toEqual([])
})

it('does not apply Chat bridge version restrictions to an enabled native transport', () => {
    const nativeTool = { ...codex, version: '0.159.3' }
    expect(
        executionToolModels([model], nativeTool, {
            ...policy,
            nativeProtocols: ['openai_responses'],
            tools: [{ id: 'codex', version: nativeTool.version, executable: '/codex' }]
        })[0].protocols
    ).toEqual(['openai_chat', 'openai_responses'])
})

it('also keeps Claude bridge qualification scoped to the requested version', () => {
    const configured: Extract<ModelExecutionPolicy, { enabled: true }> = {
        ...policy,
        chatBridgeProtocols: ['anthropic_messages'],
        tools: [
            { id: 'claude', version: '99.0.0', executable: '/claude-new' },
            { id: 'claude', version: claude.version, executable: '/claude-qualified' }
        ]
    }
    expect(executionToolModels([model], { ...claude, version: '99.0.0' }, configured)).toEqual([])
    expect(executionToolModels([model], claude, configured)).toHaveLength(1)
})
