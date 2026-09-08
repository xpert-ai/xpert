import { AIMessage, HumanMessage, RemoveMessage, SystemMessage, ToolMessage } from '@langchain/core/messages'
import { FakeListChatModel } from '@langchain/core/utils/testing'
import {
    Annotation,
    END,
    MemorySaver,
    MessagesAnnotation,
    REMOVE_ALL_MESSAGES,
    START,
    StateGraph
} from '@langchain/langgraph'
import { RunnableLambda } from '@langchain/core/runnables'
import { Logger } from '@nestjs/common'
import { Subscriber } from 'rxjs'
import { channelName } from '@xpert-ai/contracts'
import type { ModelRequest } from '@xpert-ai/plugin-sdk'
import {
    MODEL_REQUEST_FAILURE_STATE_KEY,
    ModelRequestStateError,
    modelRequestFailureUpdate,
    throwPendingModelRequestFailure,
    withModelRequestValidation
} from '../shared/agent/model-request-state'
import { estimateContextMessages } from './context-budget'
import { prepareAutomaticCompression } from './context-compression-test-utils'
import { ContextCompressionMiddleware } from './context-compression.middleware'
import type { AgentMiddleware } from '@xpert-ai/plugin-sdk'
import { createMapStreamEvents } from '../xpert-agent/agent'

jest.mock('../shared', () => ({
    AgentStateAnnotation: { State: {} },
    createTextChunk: jest.requireActual('../shared/agent/stream-text').createTextChunk
}))

jest.mock('@xpert-ai/plugin-sdk', () => ({
    __esModule: true,
    AgentMiddlewareStrategy: () => (target: unknown) => target,
    getModelContextSize: (input: { options?: Record<string, unknown> } | { profile?: { maxInputTokens?: number } }) => {
        if ('options' in input) {
            return Number(input.options?.context_size) || undefined
        }
        if ('profile' in input) {
            return input.profile?.maxInputTokens
        }
        return undefined
    }
}))

const MANUAL_RESULT_KEY = '__contextCompressionManualCommandResult'

jest.mock('i18next', () => ({ t: (_key: string, options: { defaultValue: string }) => options.defaultValue }))

function getBeforeModel(middleware: AgentMiddleware) {
    const hook = typeof middleware.beforeModel === 'function' ? middleware.beforeModel : middleware.beforeModel?.hook
    if (!hook) {
        throw new Error('Expected beforeModel hook')
    }
    return hook
}

function getWrapModelCall(middleware: AgentMiddleware) {
    if (!middleware.wrapModelCall) {
        throw new Error('Expected wrapModelCall hook')
    }
    return middleware.wrapModelCall
}

function createContext(options?: { modelResponse?: string }) {
    const candidate = options?.modelResponse ?? '<state_snapshot>Compressed history.</state_snapshot>'
    const summaryText = candidate.match(/^<state_snapshot>([\s\S]*)<\/state_snapshot>$/)?.[1]
    const model = {
        invoke: jest.fn(async (_input: unknown, config?: { metadata?: { contextCompressionPhase?: string } }) => ({
            content:
                config?.metadata?.contextCompressionPhase === 'verify'
                    ? JSON.stringify({ valid: true, missing_constraints: [], superseded_constraints: [] })
                    : summaryText === undefined
                      ? candidate
                      : JSON.stringify({ summary: summaryText, active_user_constraints: [] })
        }))
    }
    const subscriber = {
        next: jest.fn()
    }
    const runtime = {
        createModelClient: jest.fn(async () => model)
    }
    const context = {
        agentKey: 'Agent_1',
        node: {
            key: 'middleware-compression',
            title: 'Context Compression'
        },
        runtime
    }

    return {
        context: context as any,
        model,
        runtime,
        subscriber
    }
}

function createRuntimeConfig(
    subscriber: { next: jest.Mock },
    input = '/compact',
    modelOptions?: Record<string, unknown>
) {
    return {
        state: {
            human: {
                input
            }
        },
        configurable: {
            copilotModel: {
                options: {
                    context_size: 200_000,
                    ...(modelOptions ?? {})
                }
            },
            subscriber
        }
    } as any
}

describe('ContextCompressionMiddleware', () => {
    it.each([16000, 500000])(
        'hides summary model events while preserving compression status and the answer (%i input characters)',
        async (historySize) => {
            const snapshot =
                '<state_snapshot><active_user_constraints></active_user_constraints><summary>Keep the batch verification values.</summary></state_snapshot>'
            const privateText = 'Internal compression notes.'
            const summaryCompleted = jest.fn()
            const summaryModel = new FakeListChatModel({
                responses: [
                    JSON.stringify({ summary: 'Keep the batch verification values.', active_user_constraints: [] }),
                    JSON.stringify({ valid: true, missing_constraints: [], superseded_constraints: [] })
                ],
                callbacks: [{ handleLLMEnd: summaryCompleted }]
            })
            const answerModel = new FakeListChatModel({ responses: ['Batch received.'] })
            const answerInvoke = jest.spyOn(answerModel, 'invoke')
            const { context, subscriber } = createContext()
            context.runtime.createModelClient = jest.fn(async () => summaryModel)
            const middleware = await new ContextCompressionMiddleware().createMiddleware({ threshold: 0.1 }, context)
            const graph = new StateGraph(MessagesAnnotation)
                .addNode(
                    'compress',
                    async (state, config) => (await prepareAutomaticCompression(middleware, state, config)) ?? {}
                )
                .addNode('answer', async (state) => ({ messages: [await answerModel.invoke(state.messages)] }))
                .addEdge(START, 'compress')
                .addEdge('compress', 'answer')
                .addEdge('answer', END)
                .compile()
            const logger = new Logger('CompressionStreamTest')
            jest.spyOn(logger, 'verbose').mockImplementation(() => {})
            const mapEvent = createMapStreamEvents(logger, new Subscriber<MessageEvent>(), {
                unmutes: []
            })
            const runtime = createRuntimeConfig(subscriber, 'Continue.', { context_size: 32768, max_tokens: 4096 })
            const visibleChunks: unknown[] = []
            const summaryEvents: string[] = []
            for await (const event of graph.streamEvents(
                {
                    messages: [
                        new HumanMessage('x'.repeat(historySize)),
                        new AIMessage('Old answer.'),
                        new HumanMessage('Continue.')
                    ]
                },
                { ...runtime, version: 'v2', metadata: { executionId: 'compression-stream-regression' } }
            )) {
                const chunk = mapEvent(event)
                if (event.event.startsWith('on_chat_model_') && event.metadata?.langgraph_node === 'compress') {
                    summaryEvents.push(event.event)
                    expect(event.metadata).toMatchObject({
                        internal: true,
                        executionId: 'compression-stream-regression'
                    })
                    expect(chunk).toBeNull()
                }
                if (chunk) visibleChunks.push(chunk)
            }
            expect(summaryEvents).toEqual(
                expect.arrayContaining(['on_chat_model_start', 'on_chat_model_stream', 'on_chat_model_end'])
            )
            expect(summaryCompleted).toHaveBeenCalledTimes(
                summaryEvents.filter((event) => event === 'on_chat_model_end').length
            )
            if (historySize > 32768) {
                expect(summaryEvents.filter((event) => event === 'on_chat_model_start').length).toBeGreaterThan(1)
            }
            const visibleText = visibleChunks
                .flatMap((chunk) =>
                    typeof chunk === 'object' && chunk && 'text' in chunk && typeof chunk.text === 'string'
                        ? [chunk.text]
                        : []
                )
                .join('')
            expect(visibleText).toBe('Batch received.')
            expect(JSON.stringify(visibleChunks)).not.toContain(privateText)
            expect(answerInvoke.mock.calls[0][0]).toEqual(
                expect.arrayContaining([expect.objectContaining({ content: snapshot })])
            )
            expect(JSON.stringify(answerInvoke.mock.calls)).not.toContain(privateText)
            expect(subscriber.next).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        data: expect.objectContaining({
                            data: expect.objectContaining({ status: 'running' })
                        })
                    })
                })
            )
            expect(subscriber.next).toHaveBeenCalledWith(
                expect.objectContaining({
                    data: expect.objectContaining({
                        data: expect.objectContaining({
                            data: expect.objectContaining({ status: 'success', summary: snapshot })
                        })
                    })
                })
            )
            expect(JSON.stringify(subscriber.next.mock.calls)).not.toContain(privateText)
        }
    )

    it('does not replace history or publish summary notes when the model omits the state snapshot', async () => {
        const notes = '<scratchpad>Internal compression notes only.</scratchpad>'
        const { context, subscriber } = createContext({ modelResponse: notes })
        const middleware = await new ContextCompressionMiddleware().createMiddleware({ threshold: 0.1 }, context)
        const messages = [
            new HumanMessage('x'.repeat(16000)),
            new AIMessage('Old answer.'),
            new HumanMessage('Continue.')
        ]
        const result = await prepareAutomaticCompression(
            middleware,
            { messages },
            createRuntimeConfig(subscriber, 'Continue.', { context_size: 32768, max_tokens: 4096 })
        )
        expect(result && result.messages).toBeUndefined()
        expect(subscriber.next).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    data: expect.objectContaining({
                        data: expect.objectContaining({ status: 'fail' })
                    })
                })
            })
        )
        expect(JSON.stringify(subscriber.next.mock.calls)).not.toContain(notes)
    })

    it('retries a temporary summary error after backoff without blacklisting the history', async () => {
        const { context, subscriber, model } = createContext()
        model.invoke.mockRejectedValueOnce(new Error('temporary 503'))
        const middleware = await new ContextCompressionMiddleware().createMiddleware({ threshold: 0.1 }, context)
        const messages = [
            new HumanMessage('x'.repeat(16000)),
            new AIMessage('x'.repeat(16000)),
            new HumanMessage('continue')
        ]
        const runtime = createRuntimeConfig(subscriber, 'continue', { context_size: 32768, max_tokens: 4096 })
        const now = jest.spyOn(Date, 'now').mockReturnValue(10000)
        try {
            const first = await prepareAutomaticCompression(middleware, { messages }, runtime)
            expect(first && first.__contextCompressionNoGainRetryState).toBeNull()
            expect(first && first.__contextCompressionFailureRetryState).toEqual(
                expect.objectContaining({ attempts: 1 })
            )
            await prepareAutomaticCompression(middleware, { ...first, messages }, runtime)
            expect(model.invoke).toHaveBeenCalledTimes(1)
            now.mockReturnValue(12000)
            const next = await prepareAutomaticCompression(middleware, { ...first, messages }, runtime)
            expect(model.invoke).toHaveBeenCalledTimes(3)
            expect(next && next.__contextCompressionFailureRetryState).toBeNull()
            expect(next && next.messages?.[0]).toBeInstanceOf(RemoveMessage)
        } finally {
            now.mockRestore()
        }
    })

    it('checks each fallback candidate without rejecting the larger model in advance', async () => {
        const { context, subscriber } = createContext()
        const middleware = await new ContextCompressionMiddleware().createMiddleware({}, context)
        const primary = jest.fn(async () => new AIMessage('primary'))
        const fallback = jest.fn(async () => new AIMessage('fallback'))
        const runtime = createRuntimeConfig(subscriber, 'large request', { context_size: 32768, max_tokens: 4096 })
        let active: ModelRequest | undefined
        const model = withModelRequestValidation(
            RunnableLambda.from(primary),
            () => active,
            runtime.configurable.copilotModel
        ).withFallbacks([
            withModelRequestValidation(RunnableLambda.from(fallback), () => active, {
                model: 'large',
                options: { context_size: 131072, max_tokens: 4096 }
            })
        ])
        const response = await getWrapModelCall(middleware)(
            { model, messages: [new HumanMessage('x'.repeat(160000))], tools: [], state: { messages: [] }, runtime },
            async (request) => {
                active = request
                return model.invoke(request.messages)
            }
        )
        expect(response.content).toBe('fallback')
        expect(primary).not.toHaveBeenCalled()
        expect(fallback).toHaveBeenCalledTimes(1)
    })

    it('checkpoints wrapper failure state before exposing the error and does not summarize on resume', async () => {
        const {
            context,
            subscriber,
            model: summaryModel
        } = createContext({
            modelResponse: `<state_snapshot>${'z'.repeat(24000)}</state_snapshot>`
        })
        const middleware = await new ContextCompressionMiddleware().createMiddleware({}, context)
        const schema = Annotation.Root({
            ...MessagesAnnotation.spec,
            __contextCompressionNoGainRetryState: Annotation<unknown>(),
            __contextCompressionFailureRetryState: Annotation<unknown>(),
            [MODEL_REQUEST_FAILURE_STATE_KEY]: Annotation<unknown>()
        })
        const runtime = createRuntimeConfig(subscriber, 'continue', { context_size: 32768, max_tokens: 4096 })
        const config = { configurable: { ...runtime.configurable, thread_id: 'failed-request-regression' } }
        const graph = new StateGraph(schema)
            .addNode('before', async (state, config) => (await getBeforeModel(middleware)(state, config)) ?? {})
            .addNode('model', async (state, config) => {
                try {
                    await getWrapModelCall(middleware)(
                        {
                            model: new FakeListChatModel({ responses: ['unused'] }),
                            messages: state.messages,
                            systemMessage: new SystemMessage('x'.repeat(125000)),
                            tools: [],
                            state: { messages: state.messages, [channelName('Agent_1')]: state },
                            runtime: config
                        },
                        async (request) => {
                            await request.validateRequest?.(request)
                            return new AIMessage('unused')
                        }
                    )
                    return {}
                } catch (error) {
                    if (error instanceof ModelRequestStateError) return modelRequestFailureUpdate(error)
                    throw error
                }
            })
            .addNode('failure', (state) => {
                throwPendingModelRequestFailure(state)
                return {}
            })
            .addEdge(START, 'before')
            .addEdge('before', 'model')
            .addEdge('model', 'failure')
            .addEdge('failure', END)
            .compile({ checkpointer: new MemorySaver() })
        const messages = [
            new HumanMessage('x'.repeat(4000)),
            new AIMessage('x'.repeat(4000)),
            new HumanMessage('continue')
        ]
        await expect(graph.invoke({ messages }, config)).rejects.toThrow('context budget')
        const saved = await graph.getState(config)
        expect(saved.values.__contextCompressionFailureRetryState).toEqual(
            expect.objectContaining({ candidateKey: expect.any(String) })
        )
        expect(saved.next).toEqual(['failure'])
        await expect(graph.invoke(null, config)).rejects.toThrow('context budget')
        expect(summaryModel.invoke).toHaveBeenCalledTimes(1)
    })

    it('does not let the final estimate override unchanged provider usage', async () => {
        const { context, subscriber } = createContext()
        const middleware = await new ContextCompressionMiddleware().createMiddleware({}, context)
        const messages = [
            new HumanMessage('query'),
            new AIMessage({
                content: '',
                tool_calls: [{ name: 'lookup', args: {}, id: 'call' }],
                usage_metadata: { input_tokens: 30000, output_tokens: 1000, total_tokens: 31000 }
            }),
            new ToolMessage({ content: 'result', tool_call_id: 'call' })
        ]
        const invoke = jest.fn()
        await expect(
            getWrapModelCall(middleware)(
                {
                    model: new FakeListChatModel({ responses: ['unused'] }),
                    messages,
                    tools: [],
                    state: { messages },
                    runtime: createRuntimeConfig(subscriber, 'query', { context_size: 32768, max_tokens: 4096 })
                },
                async (request) => {
                    await request.validateRequest?.(request)
                    invoke()
                    return new AIMessage('unused')
                }
            )
        ).rejects.toThrow('context budget')
        expect(invoke).not.toHaveBeenCalled()
    })

    it('preserves image blocks when reducing a mixed tool result', async () => {
        const { context, subscriber } = createContext()
        const middleware = await new ContextCompressionMiddleware().createMiddleware({}, context)
        const image = { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + 'A'.repeat(400000) } }
        const result = await prepareAutomaticCompression(
            middleware,
            {
                messages: [
                    new HumanMessage('inspect'),
                    new AIMessage({ content: '', tool_calls: [{ name: 'screenshot', args: {}, id: 'call' }] }),
                    new ToolMessage({
                        content: [{ type: 'text', text: 'x'.repeat(200000) }, image],
                        tool_call_id: 'call'
                    })
                ]
            },
            createRuntimeConfig(subscriber, 'inspect', { context_size: 32768, max_tokens: 4096 })
        )
        const tool = result && result.messages?.find((message) => message instanceof ToolMessage)
        expect(Array.isArray(tool?.content)).toBe(true)
        expect(tool?.content).toContainEqual(image)
        expect(JSON.stringify(tool?.content)).not.toContain('x'.repeat(40000))
    })

    it('blocks oversized system prompts before sending a model request', async () => {
        const { context, subscriber } = createContext()
        const middleware = await new ContextCompressionMiddleware().createMiddleware({}, context)
        const handler = jest.fn(async () => new AIMessage('should not run'))
        await expect(
            getWrapModelCall(middleware)(
                {
                    model: new FakeListChatModel({ responses: ['unused'] }),
                    messages: [new HumanMessage('Hello')],
                    systemMessage: new SystemMessage('x'.repeat(150_000)),
                    tools: [],
                    state: { messages: [] },
                    runtime: createRuntimeConfig(subscriber, 'Hello', { context_size: 32768, max_tokens: 4096 })
                },
                async (request) => {
                    await request.validateRequest?.(request)
                    return handler()
                }
            )
        ).rejects.toThrow('context budget')
        expect(handler).not.toHaveBeenCalled()
    })

    it('validates additions made by subsequent wrappers immediately before invocation', async () => {
        const { context, subscriber } = createContext()
        const middleware = await new ContextCompressionMiddleware().createMiddleware({}, context)
        const invoke = jest.fn()
        await expect(
            getWrapModelCall(middleware)(
                {
                    model: new FakeListChatModel({ responses: ['unused'] }),
                    messages: [new HumanMessage('Hello')],
                    tools: [],
                    state: { messages: [] },
                    runtime: createRuntimeConfig(subscriber, 'Hello', { context_size: 32768, max_tokens: 4096 })
                },
                async (request) => {
                    const finalRequest = { ...request, systemMessage: new SystemMessage('x'.repeat(150_000)) }
                    await finalRequest.validateRequest?.(finalRequest)
                    invoke()
                    return new AIMessage('unused')
                }
            )
        ).rejects.toThrow('context budget')
        expect(invoke).not.toHaveBeenCalled()
    })

    it('retains tool reduction within a single user turn without calling a summary model', async () => {
        const { context, model, subscriber } = createContext()
        const middleware = await new ContextCompressionMiddleware().createMiddleware({}, context)
        const messages = [
            new HumanMessage('Inspect the file and keep the required output.'),
            new AIMessage({ content: '', tool_calls: [{ name: 'file_read', args: {}, id: 'read-1' }] }),
            new ToolMessage({
                content: Array(5).fill('x'.repeat(50_000)).join('\n'),
                tool_call_id: 'read-1',
                name: 'file_read'
            })
        ]
        const result = await prepareAutomaticCompression(
            middleware,
            { messages },
            createRuntimeConfig(subscriber, 'Inspect the file.', { context_size: 32768, max_tokens: 4096 })
        )
        expect(result && result.messages?.[0]).toBeInstanceOf(RemoveMessage)
        const reduced = result && result.messages?.find((message) => message instanceof ToolMessage)
        expect(reduced?.content.length).toBeLessThan(32768)
        expect(model.invoke).not.toHaveBeenCalled()
        expect(messages[2].content.length).toBeGreaterThan(200000)
    })

    it('returns output-budget failure state without mutating the hook input', async () => {
        const { context, subscriber } = createContext({
            modelResponse: `<state_snapshot>${'y'.repeat(24000)}</state_snapshot>`
        })
        const middleware = await new ContextCompressionMiddleware().createMiddleware({ threshold: 0.01 }, context)
        const state = Object.freeze({
            messages: [
                new HumanMessage('x'.repeat(12000)),
                new AIMessage('x'.repeat(12000)),
                new HumanMessage('Continue.')
            ]
        })
        const result = await prepareAutomaticCompression(
            middleware,
            state,
            createRuntimeConfig(subscriber, 'Continue.', { max_tokens: 1000 })
        )
        expect(result && result.__contextCompressionFailureRetryState).toBeDefined()
        expect(Object.keys(state)).toEqual(['messages'])
    })

    it('persists output-budget failure backoff through a real graph checkpoint', async () => {
        const { context, subscriber, model } = createContext({
            modelResponse: `<state_snapshot>${'y'.repeat(24000)}</state_snapshot>`
        })
        const middleware = await new ContextCompressionMiddleware().createMiddleware({ threshold: 0.01 }, context)
        const schema = Annotation.Root({
            ...MessagesAnnotation.spec,
            __contextCompressionNoGainRetryState: Annotation<unknown>(),
            __contextCompressionFailureRetryState: Annotation<unknown>()
        })
        const graph = new StateGraph(schema)
            .addNode(
                'compress',
                async (state, config) => (await prepareAutomaticCompression(middleware, state, config)) ?? {}
            )
            .addEdge(START, 'compress')
            .addEdge('compress', END)
            .compile({ checkpointer: new MemorySaver() })
        const runtime = createRuntimeConfig(subscriber, 'Continue.', { max_tokens: 1000 })
        const config = { ...runtime, configurable: { ...runtime.configurable, thread_id: 'no-gain-regression' } }
        await graph.invoke(
            {
                messages: [
                    new HumanMessage('x'.repeat(12000)),
                    new AIMessage('x'.repeat(12000)),
                    new HumanMessage('Continue.')
                ]
            },
            config
        )
        const saved = await graph.getState(config)
        expect(saved.values.__contextCompressionFailureRetryState).toEqual(
            expect.objectContaining({ candidateKey: expect.any(String) })
        )
        await graph.invoke({ messages: [] }, config)
        expect(model.invoke).toHaveBeenCalledTimes(1)
    })

    it('keeps full tool output in the workspace capability and preserves tool identity', async () => {
        const { context, subscriber } = createContext()
        const reference = {
            scope: 'xpert',
            filePath: '.context-compression/output.txt',
            workspacePath: '/workspace/.context-compression/output.txt'
        }
        const writeRuntimeBuffer = jest.fn(async () => ({ workspacePath: reference.workspacePath, reference }))
        context.runtime.capabilities = { get: () => ({ writeRuntimeBuffer }) }
        const middleware = await new ContextCompressionMiddleware().createMiddleware({}, context)
        const output = 'x'.repeat(200000)
        const result = await prepareAutomaticCompression(
            middleware,
            {
                messages: [
                    new HumanMessage('Read'),
                    new AIMessage({ content: '', tool_calls: [{ name: 'read', args: {}, id: 'call' }] }),
                    new ToolMessage({
                        id: 'result',
                        content: output,
                        tool_call_id: 'call',
                        name: 'read',
                        additional_kwargs: { evidence: 'keep' }
                    })
                ]
            },
            createRuntimeConfig(subscriber, 'Read', { context_size: 32768, max_tokens: 4096 })
        )
        expect(writeRuntimeBuffer).toHaveBeenCalledWith(expect.objectContaining({ buffer: Buffer.from(output) }))
        const reduced = result && result.messages?.find((message) => message instanceof ToolMessage)
        expect(reduced).toEqual(
            expect.objectContaining({
                id: 'result',
                tool_call_id: 'call',
                additional_kwargs: expect.objectContaining({ evidence: 'keep', compressionFile: reference })
            })
        )
        expect(reduced?.content).toContain(reference.workspacePath)
    })

    it('chunks oversized summary input and caps each summary model request', async () => {
        const { context, subscriber, model } = createContext()
        const middleware = await new ContextCompressionMiddleware().createMiddleware({}, context)
        const result = await prepareAutomaticCompression(
            middleware,
            {
                messages: [
                    new HumanMessage('x'.repeat(500000)),
                    new AIMessage('old answer'),
                    new HumanMessage('Continue.')
                ]
            },
            createRuntimeConfig(subscriber, 'Continue.', { context_size: 32768, max_tokens: 4096 })
        )
        expect(result && result.messages?.[0]).toBeInstanceOf(RemoveMessage)
        expect(model.invoke.mock.calls.length).toBeGreaterThan(1)
        const calls: unknown[][] = model.invoke.mock.calls
        for (const [input] of calls) {
            expect(Array.isArray(input)).toBe(true)
            if (Array.isArray(input) && input.every((message) => message instanceof HumanMessage)) {
                expect(estimateContextMessages(input) + 4096).toBeLessThan(32768)
            }
        }
    })

    it('exposes compact slash command metadata', () => {
        const strategy = new ContextCompressionMiddleware()

        expect(strategy.meta.slashCommands).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    name: 'compact',
                    aliases: ['compress'],
                    label: {
                        en_US: 'Compress',
                        zh_Hans: '压缩'
                    },
                    description: {
                        en_US: 'Compress this thread context',
                        zh_Hans: '压缩此线程的上下文'
                    },
                    action: {
                        type: 'submit_prompt',
                        template: '/compact'
                    }
                })
            ])
        )
    })

    it('skips the model and reports no-op when a manual command has no history to compress', async () => {
        const strategy = new ContextCompressionMiddleware()
        const { context, runtime, subscriber } = createContext()
        const middleware = (await strategy.createMiddleware({}, context)) as AgentMiddleware
        const beforeModel = getBeforeModel(middleware)
        const wrapModelCall = getWrapModelCall(middleware)

        const beforeResult = (await beforeModel({ messages: [] } as any, createRuntimeConfig(subscriber))) as any

        expect(runtime.createModelClient).not.toHaveBeenCalled()
        expect(beforeResult?.[MANUAL_RESULT_KEY]).toEqual({
            status: 'skipped',
            message: 'No old context was available to compress, so compression was skipped.'
        })
        expect(subscriber.next).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    data: expect.objectContaining({
                        data: expect.objectContaining({
                            status: 'success',
                            reason: 'no_messages',
                            message: {
                                en_US: 'No messages available to compress.',
                                zh_Hans: '没有可压缩的消息。'
                            }
                        })
                    })
                })
            })
        )

        const handler = jest.fn()
        const response = await wrapModelCall(
            {
                messages: [new HumanMessage('/compact')],
                state: {
                    agent_1_channel: beforeResult
                }
            } as any,
            handler
        )

        expect(handler).not.toHaveBeenCalled()
        expect(response).toBeInstanceOf(AIMessage)
        expect(response.content).toBe('No old context was available to compress, so compression was skipped.')
    })

    it('softens protected user turns when protected history exceeds the compression target', async () => {
        const strategy = new ContextCompressionMiddleware()
        const { context, model, runtime, subscriber } = createContext()
        const middleware = (await strategy.createMiddleware(
            {
                enableTwoPhaseCompression: false,
                protectedUserTurns: 2,
                preserveFraction: 0.3
            },
            context
        )) as AgentMiddleware
        const beforeModel = getBeforeModel(middleware)
        const longProtectedText = 'Protected history that should be summarized when it exceeds the budget. '.repeat(500)
        const messages = [
            new HumanMessage(longProtectedText),
            new AIMessage(longProtectedText),
            new HumanMessage('Second protected request.'),
            new AIMessage('Second protected answer.')
        ]

        const beforeResult = (await beforeModel({ messages } as any, createRuntimeConfig(subscriber))) as any

        expect(runtime.createModelClient).not.toHaveBeenCalled()
        expect(model.invoke).not.toHaveBeenCalled()
        expect(beforeResult?.[MANUAL_RESULT_KEY]).toEqual({
            status: 'compressed',
            message: 'Context compressed.'
        })
        expect(beforeResult?.messages?.[0]).toBeInstanceOf(RemoveMessage)
        expect(beforeResult.messages[1].additional_kwargs?.compressed).toBe(true)
        expect(beforeResult.messages[beforeResult.messages.length - 2].content).toBe('Second protected request.')
        expect(beforeResult.messages[beforeResult.messages.length - 1].content).toBe('Second protected answer.')

        const successEvent = subscriber.next.mock.calls.find((call) =>
            call[0]?.data?.data?.data?.summary?.includes('Earlier non-protected history was intentionally omitted')
        )
        expect(successEvent?.[0]?.data?.data?.data).toEqual(
            expect.objectContaining({
                status: 'success',
                summary: expect.stringContaining('Earlier non-protected history was intentionally omitted')
            })
        )
        expect(
            subscriber.next.mock.calls.some((call) => call[0]?.data?.data?.data?.reason === 'no_unprotected_history')
        ).toBe(false)
    })

    it('uses total token usage as the next prompt anchor for automatic compression', async () => {
        const strategy = new ContextCompressionMiddleware()
        const { context, model, runtime, subscriber } = createContext()
        const middleware = (await strategy.createMiddleware(
            {
                enableTwoPhaseCompression: false,
                threshold: 0.5,
                protectedUserTurns: 2,
                preserveFraction: 0.3
            },
            context
        )) as AgentMiddleware
        const state = {
            messages: [
                new HumanMessage('Earlier request. '.repeat(20)),
                new AIMessage({
                    content: 'Earlier answer. '.repeat(20),
                    response_metadata: {
                        usage: {
                            prompt_tokens: 90_000,
                            completion_tokens: 30_000,
                            total_tokens: 120_000
                        }
                    }
                }),
                new HumanMessage('Next request.')
            ]
        }

        const beforeResult = await prepareAutomaticCompression(
            middleware,
            state,
            createRuntimeConfig(subscriber, 'Next request.', { max_tokens: 1000 })
        )

        expect(runtime.createModelClient).toHaveBeenCalledTimes(1)
        expect(model.invoke).toHaveBeenCalledTimes(2)
        expect(beforeResult.messages[0]).toBeInstanceOf(RemoveMessage)
        expect(beforeResult.messages[0].id).toBe(REMOVE_ALL_MESSAGES)
        expect(beforeResult.messages[1]).toBeInstanceOf(HumanMessage)
        expect(beforeResult.messages[1].additional_kwargs?.compressed).toBe(true)
        expect(beforeResult.messages[beforeResult.messages.length - 1].content).toBe('Next request.')
        expect(state.messages[0].content).toContain('Earlier request.')
    })

    it('classifies an oversized summary separately from insufficient gain', async () => {
        const strategy = new ContextCompressionMiddleware()
        const { context, model, subscriber } = createContext({
            modelResponse: `<state_snapshot>${'y'.repeat(22_000)}</state_snapshot>`
        })
        const middleware = (await strategy.createMiddleware(
            {
                enableTwoPhaseCompression: false,
                threshold: 0.01,
                protectedUserTurns: 1,
                preserveFraction: 0.1
            },
            context
        )) as AgentMiddleware
        const state = {
            messages: [
                new HumanMessage('x'.repeat(12_000)),
                new AIMessage('x'.repeat(12_000)),
                new HumanMessage('Latest request.'),
                new AIMessage('Latest answer.')
            ]
        }

        const beforeResult = await prepareAutomaticCompression(
            middleware,
            state,
            createRuntimeConfig(subscriber, 'Latest request.', { max_tokens: 1000 })
        )

        expect(model.invoke).toHaveBeenCalledTimes(1)
        expect(beforeResult).toEqual(
            expect.objectContaining({
                __contextCompressionFailureRetryState: expect.any(Object),
                __contextCompressionNoGainRetryState: null
            })
        )
        expect(state.messages[0].content).toHaveLength(12_000)
        expect(subscriber.next).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    data: expect.objectContaining({
                        data: expect.objectContaining({
                            status: 'fail',
                            reason: 'summary_output_budget'
                        })
                    })
                })
            })
        )
    })

    it('uses a deterministic state-free snapshot for manual compression', async () => {
        const strategy = new ContextCompressionMiddleware()
        const { context, model, runtime, subscriber } = createContext({
            modelResponse: 'Generated summary that is longer than the compacted source. '.repeat(80)
        })
        const middleware = (await strategy.createMiddleware(
            {
                enableTwoPhaseCompression: false,
                protectedUserTurns: 1,
                preserveFraction: 0.3
            },
            context
        )) as AgentMiddleware
        const beforeModel = getBeforeModel(middleware)
        const wrapModelCall = getWrapModelCall(middleware)
        const messages = [
            new HumanMessage('Old request.'),
            new AIMessage('Old answer.'),
            new HumanMessage('Middle request.'),
            new AIMessage('Middle answer.'),
            new HumanMessage('Recent request to preserve.'),
            new AIMessage('Recent answer to preserve.')
        ]

        const beforeResult = (await beforeModel({ messages } as any, createRuntimeConfig(subscriber))) as any

        expect(runtime.createModelClient).not.toHaveBeenCalled()
        expect(model.invoke).not.toHaveBeenCalled()
        expect(beforeResult?.messages?.[0]).toBeInstanceOf(RemoveMessage)
        expect(beforeResult.messages[0].id).toBe(REMOVE_ALL_MESSAGES)
        expect(beforeResult.messages[1].content).toContain(
            'Earlier non-protected history was intentionally omitted by manual context compression.'
        )
        expect(beforeResult?.[MANUAL_RESULT_KEY]).toEqual({
            status: 'compressed',
            message: 'Context compressed.'
        })

        const fallbackEvent = subscriber.next.mock.calls.find((call) =>
            call[0]?.data?.data?.data?.summary?.includes('Earlier non-protected history was intentionally omitted')
        )
        expect(fallbackEvent?.[0]?.data?.data?.data).toEqual(
            expect.objectContaining({
                status: 'success'
            })
        )
        expect(subscriber.next.mock.calls.some((call) => call[0]?.data?.data?.data?.status === 'fail')).toBe(false)

        const handler = jest.fn()
        const response = await wrapModelCall(
            {
                messages: [...messages, new HumanMessage('/compact')],
                state: {
                    agent_1_channel: beforeResult
                }
            } as any,
            handler
        )

        expect(handler).not.toHaveBeenCalled()
        expect(response).toBeInstanceOf(AIMessage)
        expect(response.content).toBe('Context compressed.')
    })

    it('preserves recent messages when manually replacing large old context', async () => {
        const oldText = 'Old context with stale tool state. '.repeat(800)
        const strategy = new ContextCompressionMiddleware()
        const { context, model, subscriber } = createContext()
        const middleware = (await strategy.createMiddleware(
            {
                enableTwoPhaseCompression: false,
                protectedUserTurns: 1,
                preserveFraction: 0.1
            },
            context
        )) as AgentMiddleware
        const beforeModel = getBeforeModel(middleware)
        const messages = [
            new HumanMessage(oldText),
            new AIMessage(oldText),
            new HumanMessage('Latest request.'),
            new AIMessage('Latest answer.')
        ]

        const beforeResult = (await beforeModel({ messages } as any, createRuntimeConfig(subscriber))) as any

        expect(model.invoke).not.toHaveBeenCalled()
        expect(beforeResult.messages[1].content).toContain(
            'Earlier non-protected history was intentionally omitted by manual context compression.'
        )
        expect(beforeResult.messages[beforeResult.messages.length - 2].content).toBe('Latest request.')
        expect(beforeResult.messages[beforeResult.messages.length - 1].content).toBe('Latest answer.')
    })

    it('forces compression for manual commands and skips the ordinary model response', async () => {
        const strategy = new ContextCompressionMiddleware()
        const { context, model, runtime, subscriber } = createContext()
        const middleware = (await strategy.createMiddleware(
            {
                enableTwoPhaseCompression: false,
                protectedUserTurns: 1,
                preserveFraction: 0.3
            },
            context
        )) as AgentMiddleware
        const beforeModel = getBeforeModel(middleware)
        const wrapModelCall = getWrapModelCall(middleware)
        const longText = 'Older context that should be summarized. '.repeat(600)
        const messages = [
            new HumanMessage(longText),
            new AIMessage(longText),
            new HumanMessage(`${longText}More middle context.`),
            new AIMessage(longText),
            new HumanMessage('Recent request to preserve.'),
            new AIMessage('Recent answer to preserve.')
        ]

        const beforeResult = (await beforeModel({ messages } as any, createRuntimeConfig(subscriber))) as any

        expect(runtime.createModelClient).not.toHaveBeenCalled()
        expect(model.invoke).not.toHaveBeenCalled()
        expect(beforeResult?.[MANUAL_RESULT_KEY]).toEqual({
            status: 'compressed',
            message: 'Context compressed.'
        })
        expect(beforeResult?.messages?.[0]).toBeInstanceOf(RemoveMessage)
        expect(beforeResult.messages[0].id).toBe(REMOVE_ALL_MESSAGES)
        expect(beforeResult.messages[1].additional_kwargs?.compressed).toBe(true)
        const successEvent = subscriber.next.mock.calls.find((call) => call[0]?.data?.data?.data?.status === 'success')
        expect(successEvent?.[0]?.data?.data?.data?.summary).toContain(
            'Earlier non-protected history was intentionally omitted by manual context compression.'
        )

        const handler = jest.fn()
        const response = await wrapModelCall(
            {
                messages: beforeResult.messages.slice(1),
                state: {
                    human: { input: '/compress' },
                    agent_1_channel: beforeResult
                }
            } as any,
            handler
        )

        expect(handler).not.toHaveBeenCalled()
        expect(response).toBeInstanceOf(AIMessage)
        expect(response.content).toBe('Context compressed.')
    })
})
