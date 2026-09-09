import { AIMessage, HumanMessage, RemoveMessage, ToolMessage } from '@langchain/core/messages'
import {
    Annotation,
    END,
    MemorySaver,
    MessagesAnnotation,
    REMOVE_ALL_MESSAGES,
    START,
    StateGraph
} from '@langchain/langgraph'
import {
    ContextCompressionMiddleware,
    type ContextCompressionMiddlewareOptions
} from './context-compression.middleware'
import type { AgentMiddleware } from '@xpert-ai/plugin-sdk'

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

function createContext(options?: { modelResponse?: string; finishReason?: string }) {
    const model = {
        invoke: jest.fn(
            async () =>
                new AIMessage({
                    content: options?.modelResponse ?? '<state_snapshot>Compressed history.</state_snapshot>',
                    response_metadata: { finish_reason: options?.finishReason ?? 'stop' }
                })
        )
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
            rootExecutionId: 'run-1',
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
        const beforeModel = getBeforeModel(middleware)
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

        const beforeResult = (await beforeModel(
            state as any,
            createRuntimeConfig(subscriber, 'Next request.', { max_tokens: 1000 })
        )) as any

        expect(runtime.createModelClient).toHaveBeenCalledTimes(1)
        expect(model.invoke).toHaveBeenCalledTimes(1)
        expect(beforeResult.messages[0]).toBeInstanceOf(RemoveMessage)
        expect(beforeResult.messages[0].id).toBe(REMOVE_ALL_MESSAGES)
        expect(beforeResult.messages[1]).toBeInstanceOf(HumanMessage)
        expect(beforeResult.messages[1].additional_kwargs?.compressed).toBe(true)
        expect(beforeResult.messages[beforeResult.messages.length - 1].content).toBe('Next request.')
        expect(state.messages[0].content).toContain('Earlier request.')
    })

    it('rejects an automatic summary that is only marginally smaller', async () => {
        const strategy = new ContextCompressionMiddleware()
        const { context, model, subscriber } = createContext({
            modelResponse: '<state_snapshot>' + 'y'.repeat(22_000) + '</state_snapshot>'
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
        const beforeModel = getBeforeModel(middleware)
        const state = {
            messages: [
                new HumanMessage('x'.repeat(12_000)),
                new AIMessage('x'.repeat(12_000)),
                new HumanMessage('Latest request.'),
                new AIMessage('Latest answer.')
            ]
        }

        const beforeResult = await beforeModel(
            state as any,
            createRuntimeConfig(subscriber, 'Latest request.', { max_tokens: 1000 })
        )

        expect(model.invoke).toHaveBeenCalledTimes(1)
        expect(beforeResult).toEqual(
            expect.objectContaining({ __contextCompressionNoGainRetryState: expect.any(Object) })
        )
        expect(state.messages[0].content).toHaveLength(12_000)
        expect(subscriber.next).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    data: expect.objectContaining({
                        data: expect.objectContaining({
                            status: 'fail',
                            error: expect.stringContaining('failed to achieve meaningful reduction')
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

describe('context compression bug regressions', () => {
    const retryKey = '__contextCompressionFailureRetryState'
    const noGainKey = '__contextCompressionNoGainRetryState'
    const messages = () => [
        new HumanMessage('x'.repeat(12000)),
        new AIMessage('x'.repeat(12000)),
        new HumanMessage('Continue')
    ]
    async function automatic(response: string, finishReason = 'stop') {
        const f = createContext({ modelResponse: response, finishReason })
        const middleware = await new ContextCompressionMiddleware().createMiddleware(
            { threshold: 0.01, enableTwoPhaseCompression: false },
            f.context
        )
        return {
            ...f,
            middleware,
            before: getBeforeModel(middleware),
            config: createRuntimeConfig(f.subscriber, 'Continue', { context_size: 32768, max_tokens: 4096 })
        }
    }

    it('uses the original single XML summary call internally and excludes surrounding scratchpad text', async () => {
        const snapshot =
            '<state_snapshot><active_user_constraints>Reply only received.</active_user_constraints></state_snapshot>'
        const f = await automatic('<scratchpad>Private notes</scratchpad>\n```xml\n' + snapshot + '\n```')
        const update = await f.before({ messages: messages() }, f.config)
        if (!update) throw new Error('Missing compressed history')
        expect(update.messages?.[1].content).toBe(snapshot)
        expect(f.model.invoke).toHaveBeenCalledTimes(1)
        expect(f.model.invoke).toHaveBeenCalledWith(expect.any(Array), { metadata: { internal: true } })
        expect(JSON.stringify(f.model.invoke.mock.calls)).toContain('active_user_constraints')
        expect(update.messages?.[2].content).toContain('effective user constraints')
    })

    it.each([
        ['<state_snapshot>Incomplete', 'stop', 'summary_invalid'],
        ['<state_snapshot>Incomplete', 'length', 'summary_output_budget'],
        ['<scratchpad>Private notes only</scratchpad>', 'stop', 'summary_invalid']
    ])(
        'returns failed summary state through the existing beforeModel hook: %s / %s',
        async (response, finish, reason) => {
            const f = await automatic(response, finish)
            const state = { messages: messages() }
            const update = await f.before(state, f.config)
            expect(update).toEqual(expect.objectContaining({ [retryKey]: expect.any(Object), [noGainKey]: null }))
            expect(update && update.messages).toBeUndefined()
            expect(f.subscriber.next.mock.calls.at(-1)?.[0].data.data.data.reason).toBe(reason)
            await f.before({ ...state, ...update }, f.config)
            expect(f.model.invoke).toHaveBeenCalledTimes(1)
        }
    )

    it('persists a no-gain result instead of relying on mutation of a checkpoint snapshot', async () => {
        const f = await automatic('<state_snapshot>' + 'y'.repeat(22000) + '</state_snapshot>')
        const state = { messages: messages() }
        const update = await f.before(state, f.config)
        expect(update?.[noGainKey]).toEqual(expect.any(Object))
        expect(update?.[retryKey]).toBeNull()
        expect(update && update.messages).toBeUndefined()
        await f.before({ ...state, ...update }, f.config)
        expect(f.model.invoke).toHaveBeenCalledTimes(1)
        expect(f.subscriber.next.mock.calls.at(-1)?.[0].data.data.data.reason).toBe('no_token_gain')
    })
    it('checkpoints the compression failure before the ordinary model node fails, without adding a failure node', async () => {
        const f = await automatic('<state_snapshot>Incomplete')
        const schema = Annotation.Root({
            ...MessagesAnnotation.spec,
            [retryKey]: Annotation<unknown>(),
            [noGainKey]: Annotation<unknown>()
        })
        const graph = new StateGraph(schema)
            .addNode('before', async (state) => (await f.before(state, f.config)) ?? {})
            .addNode('model', () => {
                throw new Error('provider unavailable')
            })
            .addEdge(START, 'before')
            .addEdge('before', 'model')
            .addEdge('model', END)
            .compile({ checkpointer: new MemorySaver() })
        const config = { configurable: { thread_id: 'legacy-compression-checkpoint' } }
        await expect(graph.invoke({ messages: messages() }, config)).rejects.toThrow('provider unavailable')
        const saved = await graph.getState(config)
        expect(saved.values[retryKey]).toEqual(expect.any(Object))
        expect(saved.next).toEqual(['model'])
        await expect(graph.invoke(null, config)).rejects.toThrow('provider unavailable')
        expect(f.model.invoke).toHaveBeenCalledTimes(1)
    })

    it('retries a temporary summary failure after the cooldown without classifying it as no gain', async () => {
        const now = jest.spyOn(Date, 'now').mockReturnValue(10000)
        try {
            const f = await automatic('<state_snapshot>Valid memory</state_snapshot>')
            f.model.invoke.mockRejectedValueOnce(new Error('temporary 503'))
            const state = { messages: messages() }
            const failed = await f.before(state, f.config)
            expect(f.subscriber.next.mock.calls.at(-1)?.[0].data.data.data.reason).toBe('summary_service_error')
            now.mockReturnValue(12000)
            await f.before({ ...state, ...failed }, f.config)
            expect(f.model.invoke).toHaveBeenCalledTimes(1)
            f.config.configurable.rootExecutionId = 'run-2'
            const recovered = await f.before({ ...state, ...failed }, f.config)
            expect(recovered?.[retryKey]).toBeNull()
            expect(f.model.invoke).toHaveBeenCalledTimes(2)
        } finally {
            now.mockRestore()
        }
    })

    it('writes fallback summary failures through the existing afterModel hook and does not immediately repeat a failed summary', async () => {
        const f = await automatic('<state_snapshot>Incomplete')
        const state = { messages: messages() }
        const failed = await f.before(state, f.config)
        const after =
            typeof f.middleware.afterModel === 'function' ? f.middleware.afterModel : f.middleware.afterModel?.hook
        if (!after) throw new Error('Missing afterModel')
        const update = await after(
            {
                ...state,
                ...failed,
                messages: [
                    ...state.messages,
                    new AIMessage({
                        content: '',
                        response_metadata: { finish_reason: 'model_context_window_exceeded' }
                    })
                ]
            },
            f.config
        )
        expect(update?.[retryKey]).toEqual(failed?.[retryKey])
        expect(update && update.jumpTo).toBeUndefined()
        expect(f.model.invoke).toHaveBeenCalledTimes(1)
    })

    it('retains truncation without a summarizable old user turn and keeps the tool message identity', async () => {
        const f = createContext()
        const middleware = await new ContextCompressionMiddleware().createMiddleware(
            { toolOutputBudget: 4096 },
            f.context
        )
        const content = Array(2500).fill('x'.repeat(100)).join('\n')
        const update = await getBeforeModel(middleware)(
            {
                messages: [
                    new HumanMessage('Read'),
                    new ToolMessage({ id: 'result-1', name: 'read', tool_call_id: 'call-1', content })
                ]
            },
            createRuntimeConfig(f.subscriber, 'Read', { context_size: 32768, max_tokens: 4096 })
        )
        if (!update) throw new Error('Missing truncated history')
        const reduced = update.messages?.find((message) => message instanceof ToolMessage)
        expect(reduced?.id).toBe('result-1')
        expect(JSON.stringify(reduced?.content).length).toBeLessThan(32768)
        expect(f.model.invoke).not.toHaveBeenCalled()
        const file = reduced?.additional_kwargs.originalFile
        if (typeof file !== 'string') throw new Error('Missing legacy temporary output')
        const { readFile, unlink } = await import('fs/promises')
        try {
            expect(await readFile(file, 'utf8')).toBe(content)
        } finally {
            await unlink(file)
        }
    })

    it('keeps an already truncated tool result when the subsequent summary is invalid', async () => {
        const f = await automatic('<state_snapshot>Incomplete')
        const content = Array(2500).fill('x'.repeat(100)).join('\n')
        const state = {
            messages: [
                ...messages(),
                new ToolMessage({
                    id: 'result-2',
                    name: 'read',
                    tool_call_id: 'call-2',
                    content
                })
            ]
        }
        const update = await f.before(state, f.config)
        if (!update) throw new Error('Missing truncated history')
        const reduced = update.messages?.find((message) => message instanceof ToolMessage)
        const file = reduced?.additional_kwargs.originalFile
        if (typeof file !== 'string') throw new Error('Missing legacy temporary output')
        try {
            expect(reduced?.id).toBe('result-2')
            expect(JSON.stringify(reduced?.content).length).toBeLessThan(content.length)
            expect(update.messages?.some((message) => message.additional_kwargs.compressed)).toBe(false)
            expect(f.subscriber.next.mock.calls.at(-1)?.[0].data.data.data.reason).toBe('summary_invalid')
            await f.before(
                {
                    ...state,
                    ...update,
                    messages: update.messages?.filter((message) => !(message instanceof RemoveMessage)) ?? []
                },
                f.config
            )
            expect(f.model.invoke).toHaveBeenCalledTimes(1)
        } finally {
            const { unlink } = await import('node:fs/promises')
            await unlink(file)
        }
    })

    it('does not re-use provider usage after a summary replaced its measured history', async () => {
        const f = await automatic('<state_snapshot>Valid memory</state_snapshot>')
        const state = {
            messages: [
                ...messages(),
                new AIMessage({
                    content: 'answer',
                    usage_metadata: { input_tokens: 30000, output_tokens: 1000, total_tokens: 31000 }
                })
            ]
        }
        const update = await f.before(state, f.config)
        if (!update) throw new Error('Missing compressed history')
        const keptAnswer = update.messages?.at(-1)
        expect(keptAnswer?.additional_kwargs.contextCompressionUsageInvalidated).toBe(true)
    })
})

describe('context compression small-window tool budgets', () => {
    const tool = (id: string, tokens: number) =>
        new ToolMessage({ id, name: 'read_file', tool_call_id: id, content: 'x'.repeat(tokens * 4) })

    it.each<[string, ContextCompressionMiddlewareOptions]>([
        ['defaults', {}],
        ['40k protection', { pruneMinimumTokens: 0 }],
        ['20k minimum gain', { pruneProtectTokens: 0 }]
    ])('prunes an old 4k result in a 32k window with %s without invoking the summary model', async (_, options) => {
        const f = createContext()
        const middleware = await new ContextCompressionMiddleware().createMiddleware(options, f.context)
        const recent = tool('recent', 8000)
        const latest = new HumanMessage('c'.repeat(12000 * 4))
        const update = await getBeforeModel(middleware)(
            {
                messages: [
                    new HumanMessage('Read old'),
                    tool('old', 4000),
                    new HumanMessage('Read recent'),
                    recent,
                    latest
                ]
            },
            createRuntimeConfig(f.subscriber, 'Continue', { context_size: 32768, max_tokens: 4096 })
        )
        if (!update) throw new Error('Missing compression update')
        const old = update.messages?.find((message) => message.id === 'old')
        expect(old?.additional_kwargs.pruned).toBe(true)
        expect(update?.messages).toEqual(expect.arrayContaining([recent, latest]))
        expect(f.model.invoke).not.toHaveBeenCalled()
        expect(f.subscriber.next.mock.calls.at(-1)?.[0].data.data.data.status).toBe('success')
    })

    it.each([
        [4096, 1200],
        [16000, 1200],
        [4096, 5]
    ])('caps the 50k tool budget in 32k with %i output tokens reserved and %i lines', async (maxTokens, lineCount) => {
        const f = createContext()
        const middleware = await new ContextCompressionMiddleware().createMiddleware(
            { enableTwoPhaseCompression: false },
            f.context
        )
        const content = Array(lineCount)
            .fill('x'.repeat(120000 / lineCount - 1))
            .join('\n')
        const update = await getBeforeModel(middleware)(
            {
                messages: [
                    new HumanMessage('Read'),
                    new ToolMessage({ id: 'large', name: 'read_file', tool_call_id: 'large', content })
                ]
            },
            createRuntimeConfig(f.subscriber, 'Continue', { context_size: 32768, max_tokens: maxTokens })
        )
        if (!update) throw new Error('Missing compression update')
        const output = update.messages?.find((message) => message.id === 'large')
        const file = output?.additional_kwargs.originalFile
        try {
            expect(output?.additional_kwargs.truncated).toBe(true)
            const budget = Math.min(Math.round(32768 * 0.7), 32768 - maxTokens)
            expect(Math.ceil(String(output?.content).length / 4)).toBeLessThanOrEqual(budget)
            expect(f.model.invoke).not.toHaveBeenCalled()
            if (typeof file !== 'string') throw new Error('Missing original tool output')
            const { readFile } = await import('node:fs/promises')
            expect(await readFile(file, 'utf8')).toBe(content)
        } finally {
            if (typeof file === 'string') {
                const { unlink } = await import('node:fs/promises')
                await unlink(file)
            }
        }
    })

    it.each([
        [131072, 22000, 28000, 45000],
        [200000, 6000, 42000, 97000]
    ])(
        'keeps the original 40k/20k/50k behavior when it fits a %i window',
        async (window, oldTokens, recentTokens, textTokens) => {
            const f = createContext()
            const middleware = await new ContextCompressionMiddleware().createMiddleware({}, f.context)
            const update = await getBeforeModel(middleware)(
                {
                    messages: [
                        new HumanMessage('Read old'),
                        tool('old', oldTokens),
                        new HumanMessage('Read recent'),
                        tool('recent', recentTokens),
                        new HumanMessage('c'.repeat(textTokens * 4))
                    ]
                },
                createRuntimeConfig(f.subscriber, 'Continue', { context_size: window, max_tokens: 4096 })
            )
            if (!update) throw new Error('Missing compression update')
            expect(f.model.invoke).toHaveBeenCalledTimes(1)
            expect(
                update?.messages?.some(
                    (message) => message.additional_kwargs.pruned || message.additional_kwargs.truncated
                )
            ).toBe(false)
            expect(JSON.stringify(f.model.invoke.mock.calls)).not.toContain('Tool output truncated')
        }
    )
})
