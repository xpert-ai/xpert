import { AIMessage, BaseMessage, HumanMessage, RemoveMessage, ToolMessage } from '@langchain/core/messages'
import { AgentMiddleware, IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'
import { tool } from '@langchain/core/tools'
import { z } from 'zod/v3'
import { ContextCompressionMiddleware, ContextCompressionMiddlewareOptions } from './context-compression.middleware'

jest.mock('@xpert-ai/plugin-sdk', () => ({
    __esModule: true,
    AgentMiddlewareStrategy: () => (target: unknown) => target,
    getModelContextSize: (model: { options?: { context_size?: number } }) => model.options?.context_size
}))

const noGainKey = '__contextCompressionNoGainRetryState'
const files = new Set<string>()
const count = (messages: BaseMessage[]) =>
    Math.ceil(messages.reduce((sum, message) => sum + JSON.stringify(message.content).length, 0) / 4)
const old = () => [new HumanMessage('Old request.'), new AIMessage('Old answer.')]

function fixture(
    options: ContextCompressionMiddlewareOptions = {},
    snapshot = '<state_snapshot>Keep the user constraints.</state_snapshot>'
) {
    const invoke = jest.fn(async () => new AIMessage(snapshot))
    const createModelClient = jest.fn(async (_model: { options?: { max_tokens?: number } }) => ({ invoke }))
    const next = jest.fn()
    const context = {
        agentKey: 'agent',
        tools: new Map(),
        runtime: { createModelClient }
    } as unknown as IAgentMiddlewareContext
    const middleware = new ContextCompressionMiddleware().createMiddleware(options, context) as AgentMiddleware
    const before = typeof middleware.beforeModel === 'function' ? middleware.beforeModel : middleware.beforeModel?.hook
    if (!before) throw new Error('Missing beforeModel hook')
    const config = {
        state: { human: { input: 'Continue' } },
        configurable: {
            rootExecutionId: 'run-1',
            copilotModel: { options: { context_size: 32768, max_tokens: 4096 } },
            subscriber: { next }
        }
    }
    return { before, invoke, createModelClient, next, config, context }
}

function history(update: Awaited<ReturnType<ReturnType<typeof fixture>['before']>>) {
    const messages: BaseMessage[] = update
        ? (update.messages?.filter((message: BaseMessage) => !(message instanceof RemoveMessage)) ?? [])
        : []
    for (const message of messages) {
        const file = message.additional_kwargs?.originalFile
        if (typeof file === 'string') files.add(file)
    }
    return messages
}

afterEach(async () => {
    const { unlink } = await import('node:fs/promises')
    await Promise.all([...files].map((file) => unlink(file)))
    files.clear()
})

describe('context compression request budget', () => {
    it('clears a no-gain decision after the fixed input budget changes', async () => {
        const f = fixture()
        const state = { system: 's'.repeat(20000), messages: [new HumanMessage('u'.repeat(80000))] }
        const failed = await f.before(state, f.config)
        expect(failed?.[noGainKey]).toMatchObject({ fixedInputTokens: 5001 })
        const recovered = await f.before({ ...state, ...failed, system: 'Short instructions' }, f.config)
        expect(recovered?.[noGainKey]).toBeNull()
        expect(f.invoke).not.toHaveBeenCalled()
    })

    it('records the reduced history size when truncation cannot free enough space', async () => {
        const f = fixture()
        const state = {
            messages: [
                ...old(),
                new HumanMessage('u'.repeat(100000)),
                new ToolMessage({
                    id: 'large',
                    name: 'read',
                    tool_call_id: 'call',
                    content: 'x'.repeat(105083)
                })
            ]
        }
        const update = await f.before(state, f.config)
        const reduced = history(update)
        expect(reduced.find((message) => message.id === 'large')?.additional_kwargs.truncated).toBe(true)
        expect(update?.[noGainKey]).toMatchObject({
            currentTokenCount: count(reduced),
            estimatedPromptTokens: count(reduced)
        })
        const events = f.next.mock.calls.length
        await f.before({ ...state, ...update, messages: reduced }, f.config)
        expect(f.next).toHaveBeenCalledTimes(events)
        expect(f.invoke).not.toHaveBeenCalled()
    })

    it('reserves tool definitions together with other fixed input', async () => {
        const f = fixture()
        f.context.tools.set(
            'lookup',
            tool(async () => 'ok', {
                name: 'lookup',
                description: 'd'.repeat(20000),
                schema: z.object({ query: z.string() })
            })
        )
        const reduced = history(
            await f.before(
                {
                    messages: [
                        ...old(),
                        new HumanMessage('Continue'),
                        new ToolMessage({
                            id: 'large',
                            name: 'read',
                            tool_call_id: 'call',
                            content: 'x'.repeat(100000)
                        })
                    ]
                },
                f.config
            )
        )
        expect(count(reduced) + 5000).toBeLessThanOrEqual(Math.round(32768 * 0.7))
        expect(f.invoke).not.toHaveBeenCalled()
    })

    it('fits multiple escaped outputs and preserves their original files after a tighter retry', async () => {
        const f = fixture()
        const user = new HumanMessage('Keep this request. ' + 'u'.repeat(16000))
        const tools = [0, 1, 2].map(
            (index) =>
                new ToolMessage({
                    id: `output-${index}`,
                    name: 'read',
                    tool_call_id: `call-${index}`,
                    content: '"quoted" \\ escaped\n'.repeat(8000)
                })
        )
        const calls = new AIMessage({
            content: '',
            tool_calls: tools.map((result) => ({ id: result.tool_call_id, name: 'read', args: {} }))
        })
        const first = history(await f.before({ messages: [...old(), user, calls, ...tools] }, f.config))
        expect(count(first)).toBeLessThanOrEqual(Math.round(32768 * 0.7))
        const next = history(
            await f.before(
                { messages: first },
                {
                    ...f.config,
                    configurable: {
                        ...f.config.configurable,
                        copilotModel: { options: { context_size: 32768, max_tokens: 16000 } }
                    }
                }
            )
        )
        expect(count(next)).toBeLessThanOrEqual(32768 - 16000)
        expect(next).toContain(user)
        expect(f.invoke).not.toHaveBeenCalled()
        const { readFile } = await import('node:fs/promises')
        for (const original of tools) {
            const result = next.find((message) => message.id === original.id)
            expect(result).toMatchObject({ tool_call_id: original.tool_call_id })
            const file = result?.additional_kwargs.originalFile
            if (typeof file !== 'string') throw new Error('Missing original output reference')
            expect(await readFile(file, 'utf8')).toBe(original.content)
        }
    })

    it.each([80000, 105083])(
        'fits a large latest-turn tool output of %i characters without summarizing the tiny old turn',
        async (characters) => {
            const f = fixture()
            const user = new HumanMessage('Preserve this requirement. ' + 'u'.repeat(20000))
            const call = new AIMessage({ content: '', tool_calls: [{ id: 'call-1', name: 'read', args: {} }] })
            const tool = new ToolMessage({
                id: 'output-1',
                name: 'read',
                tool_call_id: 'call-1',
                content: 'x'.repeat(characters)
            })
            const update = await f.before({ messages: [...old(), user, call, tool] }, f.config)
            const reduced = history(update)

            expect(reduced.length).toBeGreaterThan(0)
            expect(count(reduced)).toBeLessThanOrEqual(Math.round(32768 * 0.7))
            expect(reduced).toContain(user)
            expect(reduced.find((message) => message.id === 'output-1')).toMatchObject({
                tool_call_id: 'call-1',
                additional_kwargs: { truncated: true }
            })
            expect(f.invoke).not.toHaveBeenCalled()
            expect(f.next.mock.calls.at(-1)?.[0].data.data.data.status).toBe('success')
        }
    )

    it('subtracts the system input instead of letting the tool fill its space', async () => {
        const f = fixture()
        const system = 'system instructions '.repeat(800)
        const state = {
            system,
            messages: [
                ...old(),
                new HumanMessage('Continue'),
                new ToolMessage({ id: 'tool', name: 'read', tool_call_id: 'call', content: 'x'.repeat(100000) })
            ]
        }
        const reduced = history(await f.before(state, f.config))
        expect(count(reduced) + Math.ceil(JSON.stringify(system).length / 4)).toBeLessThanOrEqual(
            Math.round(32768 * 0.7)
        )
        expect(f.invoke).not.toHaveBeenCalled()
    })

    it('reports an uncompressible latest user turn once instead of summarizing an irrelevant prefix', async () => {
        const f = fixture()
        const state = { messages: [...old(), new HumanMessage('u'.repeat(100000))] }
        const update = await f.before(state, f.config)
        expect(f.invoke).not.toHaveBeenCalled()
        expect(update?.[noGainKey]).toBeDefined()
        expect(f.next.mock.calls.at(-1)?.[0].data.data.data).toMatchObject({
            status: 'fail',
            reason: 'context_budget_exceeded'
        })
        await f.before({ ...state, ...update }, f.config)
        expect(f.next).toHaveBeenCalledTimes(2)
        expect(f.invoke).not.toHaveBeenCalled()
    })

    it('accepts a small summary gain when it is enough to fit the budget', async () => {
        const f = fixture({}, '<state_snapshot>Keep constraints.</state_snapshot>')
        const user = new HumanMessage('u'.repeat(22800 * 4))
        const state = { messages: [new HumanMessage('o'.repeat(1200)), new AIMessage('Acknowledged'), user] }
        const reduced = history(await f.before(state, f.config))
        expect(f.invoke).toHaveBeenCalledTimes(1)
        expect(count(reduced)).toBeLessThanOrEqual(Math.round(32768 * 0.7))
        expect(reduced).toContain(user)
        expect(f.next.mock.calls.at(-1)?.[0].data.data.data.status).toBe('success')
    })

    it('limits the summary model output to the remaining space', async () => {
        const f = fixture()
        const state = {
            messages: [
                new HumanMessage('o'.repeat(24000)),
                new AIMessage('Old answer'),
                new HumanMessage('u'.repeat(84000))
            ]
        }
        const reduced = history(await f.before(state, f.config))
        expect(reduced.length).toBeGreaterThan(0)
        expect(count(reduced)).toBeLessThanOrEqual(Math.round(32768 * 0.7))
        const modelOptions = f.createModelClient.mock.calls[0]?.[0]?.options
        expect(modelOptions?.max_tokens).toBeGreaterThan(0)
        expect(modelOptions?.max_tokens).toBeLessThan(2000)
    })

    it('does not send an oversized history to the summary model', async () => {
        const f = fixture()
        const state = {
            messages: [new HumanMessage('o'.repeat(150000)), new AIMessage('Old answer'), new HumanMessage('Continue')]
        }
        await f.before(state, f.config)
        expect(f.invoke).not.toHaveBeenCalled()
        expect(f.next.mock.calls.at(-1)?.[0].data.data.data).toMatchObject({
            status: 'fail',
            reason: 'summary_input_budget'
        })
    })

    it('does not claim success merely because no older user turn can be summarized', async () => {
        const f = fixture()
        const update = await f.before({ messages: [new HumanMessage('u'.repeat(100000))] }, f.config)
        expect(f.next.mock.calls.at(-1)?.[0].data.data.data).toMatchObject({
            status: 'fail',
            reason: 'context_budget_exceeded'
        })
        expect(update?.[noGainKey]).toBeDefined()
        expect(f.invoke).not.toHaveBeenCalled()
    })
})
