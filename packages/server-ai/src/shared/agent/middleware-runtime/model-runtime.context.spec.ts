import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { AIMessage, AIMessageChunk, HumanMessage } from '@langchain/core/messages'
import { AiModelTypeEnum, ICopilotModel, ParameterType, type ParameterRule } from '@xpert-ai/contracts'
import { ChatOAICompatReasoningModel, getModelContextSize } from '@xpert-ai/plugin-sdk'
import { AIModelGetProviderQuery } from '../../../ai-model/queries/get-provider.query'
import { GetCopilotProviderModelQuery } from '../../../copilot-provider/queries/get-model.query'
import { CopilotGetOneQuery } from '../../../copilot/queries/get-one.query'
import { ContextCompressionMiddleware } from '../../../xpert-middleware/context-compression.middleware'
import { AgentMiddlewareModelRuntimeService } from './model-runtime.service'

describe('middleware model context window', () => {
    function fixture(providerWindow?: number, rules: ParameterRule[] = []) {
        const queryBus = new QueryBus({} as never)
        const commandBus = new CommandBus({} as never)
        jest.spyOn(commandBus, 'execute').mockResolvedValue(undefined)
        const clients: ChatOAICompatReasoningModel[] = []
        const configurations: ICopilotModel[] = []
        const provider = {
            getProviderModels: () => [],
            getModelManager: () => ({ getParameterRules: () => rules }),
            getModelInstance: async (_type: AiModelTypeEnum, configuration: ICopilotModel) => {
                configurations.push(configuration)
                const client = new ChatOAICompatReasoningModel({
                    apiKey: 'test-placeholder',
                    model: 'gpt-6.1-sol',
                    maxTokens: configuration.options?.max_tokens
                })
                if (providerWindow !== undefined) {
                    Object.assign(client, { profile: { maxInputTokens: providerWindow } })
                }
                jest.spyOn(client, 'invoke').mockResolvedValue(
                    new AIMessageChunk('<state_snapshot>Preserve the current user requirements.</state_snapshot>')
                )
                clients.push(client)
                return client
            }
        }
        jest.spyOn(queryBus, 'execute').mockImplementation(async (query: unknown) => {
            if (query instanceof CopilotGetOneQuery)
                return { id: 'copilot', modelProvider: { id: 'provider', providerName: 'openai-compatible' } }
            if (query instanceof GetCopilotProviderModelQuery) return [{ modelProperties: { context_size: '256000' } }]
            if (query instanceof AIModelGetProviderQuery) return provider
            throw new Error('Unexpected model query')
        })
        const service = new AgentMiddlewareModelRuntimeService(
            commandBus,
            queryBus,
            { t: () => 'Missing model' } as never,
            {} as never,
            {} as never
        )
        const scope = { tenantId: 'tenant', organizationId: 'organization', userId: 'user' }
        const configuration: ICopilotModel = {
            model: 'gpt-6.1-sol-aigocode',
            modelType: AiModelTypeEnum.LLM,
            copilotId: 'copilot',
            options: { max_tokens: 16384 }
        }
        return { service, scope, configuration, clients, configurations }
    }

    async function compress(f: ReturnType<typeof fixture>, historyCharacters: number, threshold: number) {
        const next = jest.fn()
        const middleware = await new ContextCompressionMiddleware().createMiddleware({ threshold }, {
            agentKey: 'agent',
            tools: new Map(),
            runtime: {
                createModelClient: (configuration: ICopilotModel) =>
                    f.service.createModelClient(configuration, {}, f.scope)
            }
        } as never)
        const before =
            typeof middleware.beforeModel === 'function' ? middleware.beforeModel : middleware.beforeModel?.hook
        if (!before) throw new Error('Missing beforeModel hook')
        const currentRequest = new HumanMessage('Continue the build and preserve the agreed files.')
        const update = await before(
            {
                messages: [
                    new HumanMessage('Earlier work: ' + 'x'.repeat(historyCharacters)),
                    new AIMessage('Done'),
                    currentRequest
                ]
            },
            { configurable: { rootExecutionId: 'run', copilotModel: f.configuration, subscriber: { next } } } as never
        )
        return { next, currentRequest, update }
    }

    it('preserves cleared options and saved thinking across request overrides and repeated model creation', async () => {
        const f = fixture(undefined, [
            { name: 'temperature', label: { en_US: 'Temperature' }, type: ParameterType.FLOAT, default: 0.7 },
            { name: 'enable_thinking', label: { en_US: 'Thinking' }, type: ParameterType.BOOLEAN, default: false }
        ])
        f.configuration.options = { temperature: null, enable_thinking: true, max_tokens: 16384 }

        await f.service.createModelClient(f.configuration, { reasoningEffort: 'none' }, f.scope)
        expect(f.configurations[0].options).not.toHaveProperty('temperature')
        expect(f.configurations[0].options).toMatchObject({ enable_thinking: false, context_size: 256000 })
        expect(f.configuration.options).toMatchObject({ temperature: null, enable_thinking: true })

        await f.service.createModelClient(f.configuration, {}, f.scope)
        expect(f.configurations[1].options).not.toHaveProperty('temperature')
        expect(f.configurations[1].options).toMatchObject({ enable_thinking: true, context_size: 256000 })
        expect(f.configuration.options).toMatchObject({ temperature: null, enable_thinking: true })
    })

    it('uses the same configured window for the runtime client and automatic summary', async () => {
        const f = fixture()
        const client = await f.service.createModelClient<ChatOAICompatReasoningModel>(f.configuration, {}, f.scope)
        expect(getModelContextSize(client)).toBe(256000)
        expect(getModelContextSize(f.configuration)).toBe(256000)

        const { next, currentRequest, update } = await compress(f, 112000, 0.1)

        expect(f.clients).toHaveLength(2)
        expect(getModelContextSize(f.clients[1])).toBe(256000)
        expect(f.clients[1].invoke).toHaveBeenCalledTimes(1)
        expect(next.mock.calls.at(-1)?.[0].data.data.data.status).toBe('success')
        if (!update) throw new Error('Missing compression update')
        expect(update.messages).toContain(currentRequest)
        expect(update.messages).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ additional_kwargs: expect.objectContaining({ compressed: true }) })
            ])
        )
    })

    it('keeps a smaller declared provider window and rejects genuinely oversized summary input', async () => {
        const f = fixture(32768)
        const client = await f.service.createModelClient<ChatOAICompatReasoningModel>(f.configuration, {}, f.scope)
        expect(getModelContextSize(client)).toBe(32768)
        expect(getModelContextSize(f.configuration)).toBe(32768)

        const { next } = await compress(f, 150000, 0.7)

        expect(f.clients).toHaveLength(2)
        expect(getModelContextSize(f.clients[1])).toBe(32768)
        expect(f.clients[1].invoke).not.toHaveBeenCalled()
        expect(next.mock.calls.at(-1)?.[0].data.data.data).toMatchObject({
            status: 'fail',
            reason: 'summary_input_budget'
        })
    })
})
