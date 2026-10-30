import { EventEmitter } from 'node:events'
import { randomUUID } from 'node:crypto'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import {
    AiModelTypeEnum,
    ModelFeature,
    ParameterType,
    type ModelExecutionModel,
    XpertAgentExecutionStatusEnum,
    type ICopilotModel,
    type ParameterRule
} from '@xpert-ai/contracts'
import {
    ChatOAICompatReasoningModel,
    DefaultRuntimeCapabilityRegistry,
    ModelExecutionEnvironmentCapability
} from '@xpert-ai/plugin-sdk'
import type { Request, Response } from 'express'
import { AIModelGetProviderQuery } from '../ai-model/queries/get-provider.query'
import { GetCopilotProviderModelQuery } from '../copilot-provider/queries/get-model.query'
import { CopilotGetOneQuery } from '../copilot/queries/get-one.query'
import { AgentMiddlewareModelRuntimeService } from '../shared/agent/middleware-runtime/model-runtime.service'
import { getAssistantModelId } from '../xpert/assistant-model-selection.util'
import { AssistantExecutionPolicyService } from './assistant-execution-policy.service'
import { ModelExecutionChatService } from './execution-chat.service'
import { ModelExecutionGrantService } from './execution-grant.service'
import { ModelExecutionNativeController } from './execution-native.controller'
import { ModelExecutionOpenAIController } from './execution-openai.controller'
import { ModelExecutionGrant } from './execution.entity'
import { executionModelsSchema } from './execution-schema'

const rules: ParameterRule[] = [
    { label: { en_US: 'Parameter' }, name: 'temperature', type: ParameterType.FLOAT, default: 0.2 },
    { label: { en_US: 'Parameter' }, name: 'top_p', type: ParameterType.FLOAT, default: 0.8 },
    { label: { en_US: 'Parameter' }, name: 'enable_thinking', type: ParameterType.BOOLEAN, default: false },
    { label: { en_US: 'Parameter' }, name: 'thinking_budget', type: ParameterType.INT, default: 2048, min: 0 },
    { label: { en_US: 'Parameter' }, name: 'max_completion_tokens', type: ParameterType.INT, default: 8192 },
    { label: { en_US: 'Parameter' }, name: 'maxRetries', type: ParameterType.INT, default: 6 }
]

async function fixture(
    savedOptions: ICopilotModel['options'] = {
        enable_thinking: true,
        temperature: 0.6,
        top_p: 0.37,
        max_completion_tokens: 12345,
        thinking_budget: 4096,
        api_key: 'do-not-copy',
        extra_headers: '{"Authorization":"do-not-copy"}',
        maxRetries: 9
    }
) {
    const actor = { tenantId: randomUUID(), organizationId: randomUUID(), userId: randomUUID() }
    const copilotId = randomUUID(),
        providerId = randomUUID(),
        conversationId = randomUUID()
    const selected = {
        copilotId,
        modelType: AiModelTypeEnum.LLM as const,
        model: 'configured-model',
        options: savedOptions
    }
    const primary = { ...selected, model: 'primary-model', options: { temperature: 0.1, enable_thinking: false } }
    const assistant = {
        ...actor,
        id: randomUUID(),
        name: 'Assistant',
        version: 'v1',
        workspaceId: randomUUID(),
        copilotModel: primary,
        options: { modelSelection: { allowedModels: [selected] } }
    }
    const boundAssistant = {
        ...assistant,
        id: randomUUID(),
        copilotModel: { ...selected, options: { temperature: 0.13, enable_thinking: false } }
    }
    const executions = { findOne: jest.fn(async () => null), findOneBy: jest.fn() }
    const policy = new AssistantExecutionPolicyService(
        {
            findOne: async () => ({ id: conversationId, xpert: assistant, threadId: 'thread', projectId: 'project' })
        } as never,
        { execute: async () => ({ id: actor.userId }) } as never,
        {
            findOneBy: async () => ({
                id: copilotId,
                enabled: true,
                modelProvider: { id: providerId, organizationId: actor.organizationId }
            })
        } as never,
        {
            findOneBy: async () => ({
                preferences: { modelSelection: { selectedModelId: getAssistantModelId(selected) } }
            })
        } as never,
        executions as never,
        {
            canUseCatalogModels: async ({ models }) => models.map(() => true),
            getCatalogModelLabels: async ({ models }) =>
                models.map(() => ({
                    provider: 'fixture',
                    capabilities: [ModelFeature.MULTI_TOOL_CALL, ModelFeature.STREAM_TOOL_CALL]
                })),
            assertCanUseModel: async () => ({ billableUserId: actor.userId })
        } as never,
        {
            getAccessiblePublishedXpert: async (id: string) => (id === boundAssistant.id ? boundAssistant : assistant)
        } as never,
        { metadata: async () => ({ protocols: [], outputTokenLimit: 131072, contextWindow: 1000000 }) } as never
    )
    const config = {
        enabled: true,
        gatewayBaseUrl: 'http://gateway.test',
        tools: [{ id: 'codex', version: '0.159.2', executable: '/codex' }],
        chatBridgeProtocols: ['openai_responses'],
        limits: { leaseSeconds: 60, maxDurationSeconds: 600, maxConcurrentRequests: 2, requestsPerMinute: 30 }
    }
    let persisted: ModelExecutionGrant
    const repository = {
        create: (value) => Object.assign(new ModelExecutionGrant(), value),
        save: async (value: ModelExecutionGrant) => {
            value.id = randomUUID()
            value.createdAt = new Date()
            value.models = executionModelsSchema.parse(
                JSON.parse(JSON.stringify(value.models))
            ) as ModelExecutionModel[]
            persisted = value
            return value
        },
        findOneBy: async () => persisted
    }
    const sources = { assertCurrent: jest.fn(), invocationModelSource: jest.fn(async () => undefined) }
    const grants = new ModelExecutionGrantService(
        repository as never,
        { require: async () => config } as never,
        policy,
        sources as never,
        new DefaultRuntimeCapabilityRegistry().register(ModelExecutionEnvironmentCapability, {
            assertCurrent: async () => {}
        })
    )
    const { grant, secret } = await grants.issue(actor, {
        conversationId,
        source: { type: 'cli_session', cliSessionId: randomUUID() },
        environment: { type: 'computer', environmentId: randomUUID(), instanceId: 'instance' },
        tool: { id: 'codex', version: '0.159.2' }
    })
    const transport = jest.fn(async (request: object) => ({
        id: 'offline',
        object: 'chat.completion' as const,
        created: 0,
        model: 'configured-model',
        choices: [
            {
                index: 0,
                message: { role: 'assistant' as const, content: '', refusal: null },
                finish_reason: 'stop' as const,
                logprobs: null
            }
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
    }))
    const clients: ChatOAICompatReasoningModel[] = []
    const provider = {
        getProviderModels: () => [{ model: selected.model, model_properties: { context_size: 1000000 } }],
        getModelManager: () => ({ getParameterRules: () => rules }),
        getModelInstance: (_type: AiModelTypeEnum, configuration: ICopilotModel) => {
            const options = configuration.options
            // An OpenAI-compatible provider whose declared output field is max_completion_tokens.
            const client = new ChatOAICompatReasoningModel({
                apiKey: 'offline-fixture',
                model: configuration.model,
                streaming: false,
                temperature: options.temperature,
                topP: options.top_p,
                maxTokens: options.max_completion_tokens ?? options.max_tokens,
                maxRetries: options.maxRetries,
                modelKwargs: { enable_thinking: options.enable_thinking, thinking_budget: options.thinking_budget }
            })
            jest.spyOn(client, 'completionWithRetry').mockImplementation(transport)
            clients.push(client)
            return client
        }
    }
    const queries = new QueryBus({} as never)
    jest.spyOn(queries, 'execute').mockImplementation(async (query: unknown) => {
        if (query instanceof CopilotGetOneQuery)
            return {
                id: copilotId,
                modelProvider: { id: providerId, providerName: 'fixture', organizationId: actor.organizationId }
            }
        if (query instanceof GetCopilotProviderModelQuery) return []
        if (query instanceof AIModelGetProviderQuery) return provider
        throw new Error('Unexpected model query')
    })
    const runtime = new AgentMiddlewareModelRuntimeService(
        new CommandBus({} as never),
        queries,
        {} as never,
        {} as never,
        {} as never
    )
    const admission = {
        begin: jest.fn(
            async (_grant: ModelExecutionGrant, _model: ModelExecutionModel, _output: number, _input: number) => ({
                id: randomUUID(),
                requestId: randomUUID(),
                startedAt: new Date()
            })
        ),
        dispatch: jest.fn()
    }
    const metering = { finish: jest.fn() }
    const chat = new ModelExecutionChatService(grants, admission as never, policy, runtime as never, metering as never)
    const controller = new ModelExecutionNativeController(
        grants,
        { require: async () => config } as never,
        admission as never,
        metering as never,
        policy,
        {} as never,
        chat
    )
    const response = Object.assign(new EventEmitter(), {
        destroyed: false,
        writableEnded: false,
        headersSent: false,
        json: jest.fn(),
        status: jest.fn(),
        destroy: jest.fn()
    })
    response.status.mockReturnValue(response)
    const run = (options: object = {}) => {
        const request = Object.assign(new EventEmitter(), { headers: { authorization: `Bearer ${secret}` } })
        return controller.responses(request as Request, response as unknown as Response, {
            model: 'assistant-default',
            input: 'offline diagnostic',
            stream: false,
            ...options
        })
    }
    const chatController = new ModelExecutionOpenAIController(grants, chat)
    const runChat = (options: object = {}) => {
        const request = Object.assign(new EventEmitter(), { headers: { authorization: `Bearer ${secret}` } })
        return chatController.chat(request as Request, response as unknown as Response, {
            model: 'assistant-default',
            messages: [{ role: 'user', content: 'offline diagnostic' }],
            ...options
        })
    }
    return {
        run,
        runChat,
        transport,
        clients,
        grant,
        grants,
        secret,
        admission,
        response,
        policy,
        actor,
        conversationId,
        assistant,
        boundAssistant,
        selected,
        executions,
        sources
    }
}

describe('Assistant selection → grant → Chat bridge → provider serialization', () => {
    afterEach(() => jest.restoreAllMocks())

    it.each([
        ['none', false],
        ['high', true]
    ] as const)(
        'maps reasoning_effort=%s at provider serialization without mutating the grant',
        async (reasoning_effort, enabled) => {
            const f = await fixture({ enable_thinking: !enabled })
            await f.runChat({ reasoning_effort })
            expect(f.transport.mock.calls.at(-1)?.[0]).toMatchObject({ enable_thinking: enabled })
            expect(f.transport.mock.calls.at(-1)?.[0]).not.toHaveProperty('reasoning_effort')
            expect(f.grant.models.find((model) => model.id === f.grant.defaultModelId)?.parameters).toEqual({
                enable_thinking: !enabled
            })
            await f.runChat()
            expect(f.transport.mock.calls.at(-1)?.[0]).toMatchObject({ enable_thinking: !enabled })
        }
    )

    it.each([
        ['enabled', true],
        ['disabled', false]
    ] as const)(
        'overrides captured thinking with %s through Chat Completions without changing the grant',
        async (type, enabled) => {
            const f = await fixture({ enable_thinking: !enabled })
            await f.runChat({ thinking: { type } })
            expect(f.transport).toHaveBeenLastCalledWith(
                expect.objectContaining({ enable_thinking: enabled }),
                expect.anything()
            )
            expect(
                f.grant.models.find((model) => model.id === f.grant.defaultModelId)?.parameters.enable_thinking
            ).toBe(!enabled)
            await f.runChat()
            expect(f.transport).toHaveBeenLastCalledWith(
                expect.objectContaining({ enable_thinking: !enabled }),
                expect.anything()
            )
        }
    )

    it('inherits the selected alternative rather than the Assistant default, without credentials', async () => {
        const f = await fixture()
        expect(f.grant.defaultModelId).toBe(getAssistantModelId(f.selected))
        expect(JSON.stringify(f.grant.models)).not.toContain('do-not-copy')
        await f.run()
        expect(f.transport).toHaveBeenCalledTimes(1)
        expect(f.transport.mock.calls[0][0]).toMatchObject({
            temperature: 0.6,
            top_p: 0.37,
            max_tokens: 12345,
            enable_thinking: true,
            thinking_budget: 4096
        })
        expect(f.admission.begin.mock.calls[0][2]).toBe(12345)
        const retryable = jest.fn(async () => {
            throw new Error('retryable upstream failure')
        })
        await expect(f.clients[0].caller.call(retryable)).rejects.toThrow('retryable upstream failure')
        expect(retryable).toHaveBeenCalledTimes(1)
    })

    it('applies explicit Responses overrides at serialization, including zero and the output alias', async () => {
        const f = await fixture()
        await f.run({ temperature: 0, top_p: 0.41, max_output_tokens: 4567 })
        expect(f.transport.mock.calls[0][0]).toMatchObject({
            temperature: 0,
            top_p: 0.41,
            max_tokens: 4567,
            enable_thinking: true,
            thinking_budget: 4096
        })
        expect(f.admission.begin.mock.calls[0][2]).toBe(4567)
    })

    it('uses effective provider defaults only when settings are absent', async () => {
        const f = await fixture({})
        await f.run()
        expect(f.transport.mock.calls[0][0]).toMatchObject({
            temperature: 0.2,
            top_p: 0.8,
            max_tokens: 8192,
            enable_thinking: false,
            thinking_budget: 2048
        })
    })

    it('preserves configured false and zero', async () => {
        const f = await fixture({ enable_thinking: false, temperature: 0, thinking_budget: 0 })
        await f.run()
        expect(f.transport.mock.calls[0][0]).toMatchObject({
            temperature: 0,
            enable_thinking: false,
            thinking_budget: 0
        })
    })

    it('keeps issued parameters when the Assistant configuration subsequently changes', async () => {
        const f = await fixture()
        f.selected.options.temperature = 0.99
        f.selected.options.enable_thinking = false
        await f.run()
        expect(f.transport.mock.calls[0][0]).toMatchObject({ temperature: 0.6, enable_thinking: true })
    })

    it('takes automatic shell tuning from the matching parent execution snapshot', async () => {
        const f = await fixture()
        f.executions.findOneBy.mockResolvedValue({
            id: 'parent',
            xpertId: f.assistant.id,
            threadId: 'thread',
            status: XpertAgentExecutionStatusEnum.RUNNING,
            metadata: {
                primaryModelId: getAssistantModelId(f.selected),
                primaryModelSnapshot: { ...f.selected, options: { temperature: 0.23, enable_thinking: false } }
            }
        })
        const selected = await f.policy.resolveForExecution(f.actor, f.conversationId, 'parent')
        expect(selected.models[0].parameters).toEqual({ temperature: 0.23, enable_thinking: false })
        f.executions.findOneBy.mockResolvedValue({
            xpertId: f.assistant.id,
            threadId: 'thread',
            status: XpertAgentExecutionStatusEnum.RUNNING,
            metadata: {
                primaryModelId: getAssistantModelId(f.selected),
                primaryModelSnapshot: { ...f.selected, copilotId: randomUUID() }
            }
        })
        await expect(f.policy.resolveForExecution(f.actor, f.conversationId, 'parent')).rejects.toThrow()
    })

    it('uses the explicitly bound Assistant rather than the conversation preference', async () => {
        const f = await fixture()
        const selection = await f.policy.resolve(f.actor, f.conversationId, true, true, f.boundAssistant)
        expect(selection.defaultModelId).toBe(getAssistantModelId(f.selected))
        expect(selection.models[0].parameters).toEqual({ temperature: 0.13, enable_thinking: false })
    })

    it('still blocks revoked grants before any provider traffic', async () => {
        const f = await fixture()
        f.grant.status = 'revoked'
        await f.run()
        expect(f.transport).not.toHaveBeenCalled()
        expect(f.response.status).toHaveBeenCalledWith(403)
    })

    it('still blocks exhausted budgets before any provider traffic', async () => {
        const f = await fixture()
        f.admission.begin.mockRejectedValue(new Error('budget denied'))
        await f.run()
        expect(f.transport).not.toHaveBeenCalled()
    })
})
