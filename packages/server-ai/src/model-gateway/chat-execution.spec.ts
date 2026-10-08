import { AIMessageChunk } from '@langchain/core/messages'
import { ModelFeature, ModelGatewayUsageSourceEnum } from '@xpert-ai/contracts'
import { executeGatewayChat } from './chat-execution'
import { parseOpenAIChatRequest } from './openai-adapter'
import type { GatewayChatWriter } from './chat-writer'

function setup() {
    const abort = new AbortController()
    const writer: GatewayChatWriter = { start: jest.fn(), delta: jest.fn(), complete: jest.fn(), fail: jest.fn() }
    const stream = jest.fn(async function* () {
        yield new AIMessageChunk({
            content: 'working',
            tool_call_chunks: [{ index: 0, id: 'tool-a', name: 'read', args: '{"path":"x"}', type: 'tool_call_chunk' }]
        })
        yield new AIMessageChunk({
            content: '',
            usage_metadata: { input_tokens: 10, output_tokens: 3, total_tokens: 13 },
            response_metadata: { finish_reason: 'tool_calls' }
        })
    })
    const response = { headersSent: true }
    const lifecycle = {
        capabilities: [ModelFeature.STREAM_TOOL_CALL],
        begin: jest.fn(async () => ({ requestId: 'one-attempt', startedAt: new Date() })),
        createModel: jest.fn(async () => ({ stream }) as never),
        beforeDispatch: jest.fn(),
        settle: jest.fn()
    }
    const parsed = parseOpenAIChatRequest({
        model: 'alias',
        messages: [{ role: 'user', content: 'test' }],
        stream: true
    })
    const run = () =>
        executeGatewayChat({ response: response as never, parsed, signal: abort.signal, lifecycle, writer })
    return { run, writer, lifecycle, stream, abort }
}
describe('one governed Chat attempt across protocol writers', () => {
    it('settles once using provider usage, independently of the selected response format', async () => {
        const f = setup()
        await f.run()
        expect(f.lifecycle.begin).toHaveBeenCalledTimes(1)
        expect(f.lifecycle.beforeDispatch).toHaveBeenCalledTimes(1)
        expect(f.stream).toHaveBeenCalledTimes(1)
        expect(f.lifecycle.settle).toHaveBeenCalledTimes(1)
        expect(f.lifecycle.settle).toHaveBeenCalledWith(
            expect.objectContaining({
                usage: expect.objectContaining({
                    source: ModelGatewayUsageSourceEnum.Provider,
                    inputTokens: 10,
                    outputTokens: 3,
                    totalTokens: 13
                })
            })
        )
        expect(f.writer.complete).toHaveBeenCalledWith(expect.objectContaining({ reason: 'tool_calls' }))
    })
    it('does not replay inference or invent actual usage when the client cancels midstream', async () => {
        const f = setup()
        jest.mocked(f.writer.delta).mockImplementation(async () => {
            f.abort.abort()
            f.abort.signal.throwIfAborted()
        })
        await f.run()
        expect(f.stream).toHaveBeenCalledTimes(1)
        expect(f.writer.complete).not.toHaveBeenCalled()
        expect(f.lifecycle.settle).toHaveBeenCalledTimes(1)
        expect(f.lifecycle.settle).toHaveBeenCalledWith(
            expect.objectContaining({
                error: expect.objectContaining({ name: 'AbortError' }),
                usage: expect.objectContaining({ source: ModelGatewayUsageSourceEnum.Estimated })
            })
        )
    })
    it('releases an undispatched rejection through the lifecycle and never calls the model', async () => {
        const f = setup()
        f.lifecycle.beforeDispatch.mockRejectedValue(new Error('revoked'))
        await f.run()
        expect(f.stream).not.toHaveBeenCalled()
        expect(f.lifecycle.settle).toHaveBeenCalledTimes(1)
    })
})
