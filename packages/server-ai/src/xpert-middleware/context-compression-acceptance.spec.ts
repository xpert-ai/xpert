import { AIMessage, HumanMessage, RemoveMessage, SystemMessage, ToolMessage } from '@langchain/core/messages'
import { channelName } from '@xpert-ai/contracts'
import { FakeListChatModel } from '@langchain/core/utils/testing'
import { Subscriber } from 'rxjs'
import type { AgentMiddleware, IAgentMiddlewareContext, ModelRequest } from '@xpert-ai/plugin-sdk'
import { ContextCompressionMiddleware, ContextCompressionMiddlewareOptions } from './context-compression.middleware'
import { prepareAutomaticCompression } from './context-compression-test-utils'
import { ModelRequestStateError } from '../shared/agent/model-request-state'

jest.mock('@xpert-ai/plugin-sdk', () => ({
    AgentMiddlewareStrategy: () => (target: unknown) => target,
    getModelContextSize: jest.requireActual<typeof import('../../../plugin-sdk/src/lib/ai-model/utils/limits')>(
        '../../../plugin-sdk/src/lib/ai-model/utils/limits'
    ).getModelContextSize
}))
jest.mock('i18next', () => ({ t: (_key: string, options: { defaultValue: string }) => options.defaultValue }))

async function fixture(response: string | string[], options: ContextCompressionMiddlewareOptions = { threshold: 0.1 }) {
    const model = new FakeListChatModel({ responses: typeof response === 'string' ? [response] : response })
    const invoke = jest.spyOn(model, 'invoke')
    const events: MessageEvent[] = []
    const subscriber = new Subscriber<MessageEvent>({
        next: (event) => {
            events.push(event)
        },
        error: () => {},
        complete: () => {}
    })
    const context = {
        agentKey: 'Agent_1',
        runtime: { createModelClient: jest.fn(async () => model) }
    } as unknown as IAgentMiddlewareContext
    const runtime: ModelRequest['runtime'] = {
        configurable: {
            copilotModel: { model: 'test', options: { context_size: 32768, max_tokens: 4096 } },
            subscriber
        }
    }
    const messages = [new HumanMessage('x'.repeat(16000)), new AIMessage('old answer'), new HumanMessage('Continue')]
    const middleware = await new ContextCompressionMiddleware().createMiddleware(options, context)
    return { model, invoke, events, runtime, messages, middleware }
}

function before(middleware: AgentMiddleware) {
    const hook = typeof middleware.beforeModel === 'function' ? middleware.beforeModel : middleware.beforeModel?.hook
    if (!hook) throw new Error('Missing beforeModel')
    return hook
}

function after(middleware: AgentMiddleware) {
    const hook = typeof middleware.afterModel === 'function' ? middleware.afterModel : middleware.afterModel?.hook
    if (!hook) throw new Error('Missing afterModel')
    return hook
}

const retryApplied = '__contextCompressionContextWindowRetryApplied'
const retryPending = '__contextCompressionContextWindowRetryPending'
const validSummary = [
    JSON.stringify({ summary: 'Earlier batches', active_user_constraints: ['Reply only received'] }),
    '```json\n{"valid":true,"missing_constraints":[],"superseded_constraints":[]}\n```'
]
const rejectedAnswer = () =>
    new AIMessage({ content: '', response_metadata: { finish_reason: 'model_context_window_exceeded' } })

describe('context compression acceptance', () => {
    it.each(['profile', 'metadata'] as const)(
        'compresses and validates using the model %s when no context size is configured',
        async (source) => {
            const f = await fixture(validSummary)
            f.runtime.configurable.copilotModel = { model: 'test', options: { max_tokens: 4096 } }
            if (source === 'metadata') {
                f.model.metadata = { profile: { maxInputTokens: 32768 } }
            } else {
                Object.defineProperty(f.model, 'profile', { value: { maxInputTokens: 32768 } })
            }
            const wrap = f.middleware.wrapModelCall
            if (!wrap) throw new Error('Missing wrapper')
            await wrap(
                { model: f.model, messages: f.messages, tools: [], state: { messages: [] }, runtime: f.runtime },
                async (request) => {
                    expect(request.messages.some((message) => message.additional_kwargs?.compressed)).toBe(true)
                    expect(request.validateRequest).toBeDefined()
                    await request.validateRequest({ ...request, finalMessages: request.messages })
                    return new AIMessage('Received')
                }
            )
            expect(f.invoke).toHaveBeenCalledTimes(2)
            expect(f.events.at(-1)?.data.data.data.status).toBe('success')
            expect(f.runtime.configurable.copilotModel.options.context_size).toBeUndefined()
        }
    )

    it('rejects an oversized latest input using the model profile when no context size is configured', async () => {
        const f = await fixture(validSummary)
        f.runtime.configurable.copilotModel = { model: 'test', options: { max_tokens: 4096 } }
        Object.defineProperty(f.model, 'profile', { value: { maxInputTokens: 32768 } })
        const wrap = f.middleware.wrapModelCall
        if (!wrap) throw new Error('Missing wrapper')
        const invoke = jest.fn()
        await expect(
            wrap(
                {
                    model: f.model,
                    messages: [new HumanMessage('x'.repeat(160000))],
                    tools: [],
                    state: { messages: [] },
                    runtime: f.runtime
                },
                async (request) => {
                    await request.validateRequest?.({ ...request, finalMessages: request.messages })
                    invoke()
                    return new AIMessage('unused')
                }
            )
        ).rejects.toBeInstanceOf(ModelRequestStateError)
        expect(invoke).not.toHaveBeenCalled()
        expect(f.invoke).not.toHaveBeenCalled()
        expect(f.events.at(-1)?.data.data.data.reason).toBe('context_budget_exceeded')
    })

    it('validates a fallback with no configured context size against its own model profile', async () => {
        const f = await fixture(validSummary, { threshold: 0.9 })
        Object.defineProperty(f.model, 'profile', { value: { maxInputTokens: 8192 } })
        const wrap = f.middleware.wrapModelCall
        if (!wrap) throw new Error('Missing wrapper')
        const invoke = jest.fn()
        await expect(
            wrap(
                { model: f.model, messages: f.messages, tools: [], state: { messages: [] }, runtime: f.runtime },
                async (request) => {
                    await request.validateRequest?.({
                        ...request,
                        finalMessages: request.messages,
                        runtime: {
                            ...request.runtime,
                            configurable: {
                                ...request.runtime.configurable,
                                copilotModel: { model: 'fallback', options: { max_tokens: 4096 } }
                            }
                        }
                    })
                    invoke()
                    return new AIMessage('unused')
                }
            )
        ).rejects.toBeInstanceOf(ModelRequestStateError)
        expect(invoke).not.toHaveBeenCalled()
        expect(f.invoke).not.toHaveBeenCalled()
        expect(f.events.at(-1)?.data.data.data.reason).toBe('context_budget_exceeded')
    })

    it('keeps the configured context size authoritative over the model profile', async () => {
        const f = await fixture(validSummary, { threshold: 0.9 })
        Object.defineProperty(f.model, 'profile', { value: { maxInputTokens: 8192 } })
        const wrap = f.middleware.wrapModelCall
        if (!wrap) throw new Error('Missing wrapper')
        await wrap(
            { model: f.model, messages: f.messages, tools: [], state: { messages: [] }, runtime: f.runtime },
            async (request) => {
                expect(request.validateRequest).toBeDefined()
                await request.validateRequest({ ...request, finalMessages: request.messages })
                return new AIMessage('Received')
            }
        )
        expect(f.invoke).not.toHaveBeenCalled()
        expect(f.events).toHaveLength(0)
    })

    it('preserves pass-through when neither configuration nor model profile provides a context size', async () => {
        const f = await fixture(validSummary)
        f.runtime.configurable.copilotModel = { model: 'test', options: { max_tokens: 4096 } }
        Object.defineProperty(f.model, 'profile', { value: { maxInputTokens: null } })
        const wrap = f.middleware.wrapModelCall
        if (!wrap) throw new Error('Missing wrapper')
        const request: ModelRequest = {
            model: f.model,
            messages: f.messages,
            tools: [],
            state: { messages: [] },
            runtime: f.runtime
        }
        const handler = jest.fn(() => new AIMessage('Received'))
        await wrap(request, handler)
        expect(handler).toHaveBeenCalledWith(request)
        expect(f.invoke).not.toHaveBeenCalled()
        expect(f.events).toHaveLength(0)
    })

    it('attempts a failed summary only once across the before hook and complete request wrapper', async () => {
        const f = await fixture('invalid')
        const state = await before(f.middleware)({ messages: f.messages }, f.runtime)
        expect(f.invoke).not.toHaveBeenCalled()
        const wrap = f.middleware.wrapModelCall
        if (!wrap) throw new Error('Missing wrapper')
        await wrap(
            {
                model: f.model,
                messages: f.messages,
                systemMessage: new SystemMessage('s'.repeat(4000)),
                tools: [],
                state: { [channelName('Agent_1')]: state },
                runtime: f.runtime
            },
            async (request) => {
                await request.validateRequest?.({
                    ...request,
                    finalMessages: [request.systemMessage, ...request.messages]
                })
                return new AIMessage('Received')
            }
        )
        expect(f.invoke).toHaveBeenCalledTimes(1)
        expect(f.events.filter((event) => event.data.data.data.status === 'running')).toHaveLength(1)
        expect(f.events.filter((event) => event.data.data.data.status === 'fail')).toHaveLength(1)
    })

    it('schedules a single provider-limit retry and performs compression only at the complete request boundary', async () => {
        const f = await fixture(validSummary, { threshold: 0.9 })
        const scheduled = await after(f.middleware)({ messages: [...f.messages, rejectedAnswer()] }, f.runtime)
        expect(scheduled).toMatchObject({ [retryApplied]: true, [retryPending]: true, jumpTo: 'model' })
        expect(scheduled && scheduled.messages?.[0]).toBeInstanceOf(RemoveMessage)
        const messages = scheduled && scheduled.messages?.filter((message) => !(message instanceof RemoveMessage))
        expect(messages).toEqual(f.messages)
        await before(f.middleware)({ ...scheduled, messages }, f.runtime)
        expect(f.invoke).not.toHaveBeenCalled()
        expect(f.events).toHaveLength(0)

        const update = await prepareAutomaticCompression(f.middleware, { ...scheduled, messages }, f.runtime)
        expect(update?.[retryPending]).toBe(false)
        expect(update?.messages?.some((message) => message.additional_kwargs?.compressed)).toBe(true)
        expect(f.invoke).toHaveBeenCalledTimes(2)
        const secondRejection = await after(f.middleware)(
            { ...scheduled, ...update, messages: [rejectedAnswer()] },
            f.runtime
        )
        expect(secondRejection).toMatchObject({ [retryApplied]: false, [retryPending]: false })
        expect(secondRejection && secondRejection.jumpTo).toBeUndefined()
        expect(f.invoke).toHaveBeenCalledTimes(2)
    })

    it('persists a failed forced attempt and never resends an unchanged provider-rejected request', async () => {
        const f = await fixture('invalid', { threshold: 0.9 })
        const scheduled = await after(f.middleware)({ messages: [...f.messages, rejectedAnswer()] }, f.runtime)
        const wrap = f.middleware.wrapModelCall
        if (!wrap) throw new Error('Missing wrapper')
        const handler = jest.fn(async () => new AIMessage('unused'))
        try {
            await wrap(
                {
                    model: f.model,
                    messages: f.messages,
                    tools: [],
                    state: { [channelName('Agent_1')]: scheduled },
                    runtime: f.runtime
                },
                handler
            )
            throw new Error('Expected rejected retry')
        } catch (error) {
            expect(error).toBeInstanceOf(ModelRequestStateError)
            if (!(error instanceof ModelRequestStateError)) throw error
            expect(error.agentStateUpdate).toMatchObject({
                [retryPending]: false,
                __contextCompressionFailureRetryState: { attempts: 1 }
            })
            expect(error.agentStateUpdate.messages).toBeUndefined()
        }
        expect(handler).not.toHaveBeenCalled()
        expect(f.invoke).toHaveBeenCalledTimes(1)
    })

    it('clears retry flags after a normal answer or an explicit manual compression', async () => {
        const f = await fixture(validSummary)
        const state = { [retryApplied]: true, [retryPending]: true }
        const completed = await after(f.middleware)({ ...state, messages: [new AIMessage('Received')] }, f.runtime)
        expect(completed).toMatchObject({ [retryApplied]: false, [retryPending]: false })
        const manual = await before(f.middleware)(
            { ...state, messages: [...f.messages, new HumanMessage('/compact')] },
            f.runtime
        )
        expect(manual).toMatchObject({ [retryApplied]: false, [retryPending]: false })
        expect(f.invoke).not.toHaveBeenCalled()
    })

    it('does not carry a failed request retry flag into the next ordinary model request', async () => {
        const f = await fixture(validSummary, { threshold: 0.9 })
        const update = await prepareAutomaticCompression(
            f.middleware,
            { messages: f.messages, [retryApplied]: true, [retryPending]: false },
            f.runtime
        )
        expect(update?.[retryApplied]).toBe(false)
        expect(f.invoke).not.toHaveBeenCalled()
        const scheduled = await after(f.middleware)(
            { ...update, messages: [...f.messages, rejectedAnswer()] },
            f.runtime
        )
        expect(scheduled).toMatchObject({ [retryApplied]: true, [retryPending]: true, jumpTo: 'model' })
    })

    it('still reduces new tool output after an earlier compression in the same user turn', async () => {
        const f = await fixture(validSummary)
        const first = await prepareAutomaticCompression(f.middleware, { messages: f.messages }, f.runtime)
        const messages = [
            ...first.messages.filter((message) => !(message instanceof RemoveMessage)),
            new AIMessage({ content: '', tool_calls: [{ id: 'read', name: 'file_read', args: {} }] }),
            new ToolMessage({ content: 'x'.repeat(180000), tool_call_id: 'read', name: 'file_read' })
        ]
        const second = await prepareAutomaticCompression(f.middleware, { ...first, messages }, f.runtime)
        const reduced = second.messages?.find((message) => message instanceof ToolMessage)
        expect(reduced?.content.length).toBeLessThan(180000)
        expect(f.events.filter((event) => event.data.data.data.status === 'success')).toHaveLength(2)
    })

    it('does not misclassify a valid reduction above the soft target as a hard budget failure', async () => {
        const f = await fixture([
            JSON.stringify({ summary: 'Earlier batches', active_user_constraints: [] }),
            JSON.stringify({ valid: true, missing_constraints: [], superseded_constraints: [] })
        ])
        const messages = [...f.messages.slice(0, -1), new HumanMessage('y'.repeat(16000))]
        const result = await prepareAutomaticCompression(f.middleware, { messages }, f.runtime)
        expect(result && result.messages).toBeDefined()
        expect(f.events.at(-1)?.data.data.data.status).toBe('success')
    })
    it('records no gain only after a valid, constraint-checked summary fails to reduce history', async () => {
        const f = await fixture([
            JSON.stringify({ summary: 'x'.repeat(1000), active_user_constraints: [] }),
            JSON.stringify({ valid: true, missing_constraints: [], superseded_constraints: [] })
        ])
        const messages = [
            new HumanMessage('old'),
            new AIMessage({
                content: 'old',
                usage_metadata: { input_tokens: 6000, output_tokens: 10, total_tokens: 6010 }
            }),
            new HumanMessage('Continue')
        ]
        const state = await prepareAutomaticCompression(f.middleware, { messages }, f.runtime)
        expect(state && state.__contextCompressionNoGainRetryState).toEqual(
            expect.objectContaining({ candidateKey: expect.any(String) })
        )
        expect(state && state.__contextCompressionFailureRetryState).toBeNull()
        expect(state && state.messages).toBeUndefined()
        expect(f.events.at(-1)?.data.data.data).toMatchObject({ status: 'fail', reason: 'no_token_gain' })
        await prepareAutomaticCompression(f.middleware, { ...state, messages }, f.runtime)
        expect(f.invoke).toHaveBeenCalledTimes(2)
    })

    it('preserves original history and failure state when the constraint review rejects a summary', async () => {
        const f = await fixture([
            JSON.stringify({ summary: 'Batch 1 has 68 records.', active_user_constraints: [] }),
            JSON.stringify({ valid: false, missing_constraints: ['Reply only received'], superseded_constraints: [] })
        ])
        const result = await prepareAutomaticCompression(f.middleware, { messages: f.messages }, f.runtime)
        expect(result && result.messages).toBeUndefined()
        expect(result && result.__contextCompressionFailureRetryState).toEqual(expect.objectContaining({ attempts: 1 }))
        expect(f.events.at(-1)?.data.data.data).toMatchObject({ status: 'fail', reason: 'summary_constraints_lost' })
        expect(JSON.stringify(f.events)).not.toContain('Batch 1 has 68 records')
    })

    it('rejects removal of accepted memory in a later wrapper while preserving the prepared state', async () => {
        const f = await fixture([
            JSON.stringify({ summary: 'Earlier batches', active_user_constraints: ['Reply only received'] }),
            JSON.stringify({ valid: true, missing_constraints: [], superseded_constraints: [] })
        ])
        const wrap = f.middleware.wrapModelCall
        if (!wrap) throw new Error('Missing wrapper')
        const invoke = jest.fn()
        await expect(
            wrap(
                { model: f.model, messages: f.messages, tools: [], state: { messages: [] }, runtime: f.runtime },
                async (request) => {
                    await request.validateRequest?.({ ...request, finalMessages: [new HumanMessage('Continue')] })
                    invoke()
                    return new AIMessage('unused')
                }
            )
        ).rejects.toMatchObject({ agentStateUpdate: { messages: expect.any(Array) } })
        expect(invoke).not.toHaveBeenCalled()
        expect(f.events.at(-1)?.data.data.data.reason).toBe('context_validation_failed')
    })

    it('classifies malformed summaries as retryable failures, not no-gain history', async () => {
        const f = await fixture('<scratchpad>not a summary</scratchpad>')
        const result = await prepareAutomaticCompression(f.middleware, { messages: f.messages }, f.runtime)
        expect(result && result.messages).toBeUndefined()
        expect(result && result.__contextCompressionNoGainRetryState).toBeNull()
        expect(result && result.__contextCompressionFailureRetryState).toEqual(expect.objectContaining({ attempts: 1 }))
        expect(f.events.at(-1)?.data.data.data).toMatchObject({ status: 'fail', reason: 'summary_invalid' })
        expect(f.events.filter((event) => event.data.data.data.status === 'running')).toHaveLength(1)
        expect(new Set(f.events.map((event) => event.data.data.id)).size).toBe(1)
    })

    it('does not leave a running event when an unchanged failed candidate is deferred', async () => {
        const f = await fixture('invalid')
        const result = await prepareAutomaticCompression(f.middleware, { messages: f.messages }, f.runtime)
        const start = f.events.length
        await prepareAutomaticCompression(f.middleware, { ...result, messages: f.messages }, f.runtime)
        expect(f.invoke).toHaveBeenCalledTimes(1)
        expect(f.events.slice(start).some((event) => event.data.data.data.status === 'running')).toBe(false)
    })
})
