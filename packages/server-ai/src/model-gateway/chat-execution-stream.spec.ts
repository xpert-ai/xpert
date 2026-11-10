import { AIMessageChunk } from '@langchain/core/messages'
import { EventEmitter, getEventListeners } from 'node:events'
import type { Response } from 'express'
import { executeGatewayChat } from './chat-execution'
import { parseOpenAIChatRequest } from './openai-adapter'
import { executionRequestLifetime } from '../model-execution/execution-request-lifetime'
import type { ModelExecutionGrant } from '../model-execution/execution.entity'

function fixture(fail = false) {
    const abort = new AbortController()
    const response = Object.assign(new EventEmitter(), {
        headersSent: false,
        destroyed: false,
        writableEnded: false,
        writableNeedDrain: false,
        status: jest.fn(),
        setHeader: jest.fn(),
        flushHeaders: jest.fn(() => {
            response.headersSent = true
        }),
        write: jest.fn<boolean, [string]>().mockReturnValue(true),
        end: jest.fn(() => {
            response.writableEnded = true
            response.emit('finish')
        }),
        destroy: jest.fn()
    })
    const activity = jest.fn()
    const stream = jest.fn(async function* () {
        for (let index = 0; index < 3; index++) {
            await new Promise<void>((resolve) => setTimeout(resolve, 40_000))
            abort.signal.throwIfAborted()
            yield new AIMessageChunk({ content: '', additional_kwargs: { reasoning_content: 'private fixture' } })
        }
        if (fail) throw new Error('provider failed')
        yield new AIMessageChunk({
            content: 'done',
            usage_metadata: { input_tokens: 7, output_tokens: 5, total_tokens: 12 }
        })
    })
    const lifecycle = {
        capabilities: [],
        begin: jest.fn(async () => ({ requestId: 'keepalive', startedAt: new Date(0) })),
        createModel: jest.fn(async () => ({ stream }) as never),
        settle: jest.fn()
    }
    const run = () =>
        executeGatewayChat({
            response: response as unknown as Response,
            parsed: parseOpenAIChatRequest({
                model: 'fixture',
                messages: [{ role: 'user', content: 'test' }],
                stream: true
            }),
            signal: abort.signal,
            lifecycle,
            onActivity: activity
        })
    return { run, response, abort, lifecycle, activity, stream }
}

describe('Chat Completion decoded-stream keepalive', () => {
    beforeEach(() => jest.useFakeTimers())
    afterEach(() => jest.useRealTimers())

    it.each([false, true])(
        'keeps hidden-reasoning gaps alive without content or usage fabrication (failure=%s)',
        async (fail) => {
            const f = fixture(fail)
            const pending = f.run()
            await jest.advanceTimersByTimeAsync(90_000)
            const chunks = f.response.write.mock.calls.map(([value]) => JSON.parse(value.slice(6)))
            expect(chunks).toHaveLength(4)
            expect(chunks.slice(1)).toEqual(
                Array(3).fill({
                    id: 'chatcmpl-keepalive',
                    created: 0,
                    model: 'fixture',
                    object: 'chat.completion.chunk',
                    choices: [{ index: 0, delta: {}, finish_reason: null }]
                })
            )
            expect(f.activity).toHaveBeenCalledTimes(3) // Dispatch and two actual upstream chunks only.
            expect(f.lifecycle.settle).not.toHaveBeenCalled()
            await jest.advanceTimersByTimeAsync(30_000)
            await pending
            expect(f.lifecycle.settle).toHaveBeenCalledTimes(1)
            expect(f.stream).toHaveBeenCalledTimes(1)
            expect(f.response.write.mock.calls.flat().join('')).not.toContain('private fixture')
            expect(f.response.setHeader).toHaveBeenCalledWith('X-Accel-Buffering', 'no')
            expect(jest.getTimerCount()).toBe(0)
            expect(getEventListeners(f.abort.signal, 'abort')).toHaveLength(0)
            if (!fail)
                expect(f.lifecycle.settle).toHaveBeenCalledWith(
                    expect.objectContaining({
                        usage: expect.objectContaining({ inputTokens: 7, outputTokens: 5, totalTokens: 12 })
                    })
                )
        }
    )

    it('does not extend the provider idle limit while keeping the client transport alive', async () => {
        const f = fixture()
        const lifetime = executionRequestLifetime(
            {
                limits: { requestIdleSeconds: 35 },
                absoluteExpiresAt: new Date(Date.now() + 180_000)
            } as ModelExecutionGrant,
            f.abort
        )
        const pending = f.run()
        await jest.advanceTimersByTimeAsync(40_000)
        await pending
        expect(f.abort.signal.aborted).toBe(true)
        expect(f.activity).toHaveBeenCalledTimes(1)
        expect(f.lifecycle.settle).toHaveBeenCalledWith(expect.objectContaining({ error: f.abort.signal.reason }))
        lifetime.dispose()
        expect(jest.getTimerCount()).toBe(0)
    })
})
