import { AIMessage, AIMessageChunk, HumanMessage, ToolMessage } from '@langchain/core/messages'
import { nativeChatModelReservation, nativeLLMReservation } from './native-model-reservation'

describe('native model request reservation', () => {
    const extra = { invocation_params: { max_tokens: 1024 } }
    it('does not reserve twice for completed stream fragments, while retaining provider metadata', () => {
        const call = { name: 'inspect', id: 'call', args: { text: '中'.repeat(10000) } }
        const fields = {
            content: '',
            tool_calls: [call],
            additional_kwargs: { reasoning_content: 'reasoning' },
            response_metadata: { output: [{ type: 'reasoning', encrypted_content: 'opaque' }] }
        }
        const complete = new AIMessage(fields)
        const streamed = new AIMessageChunk({
            ...fields,
            tool_call_chunks: [{ name: call.name, id: call.id, index: 0, args: JSON.stringify(call.args) }]
        })
        // Chunk construction may add the canonical tool_call type tag; no duplicated argument body remains.
        expect(
            Math.abs(nativeChatModelReservation([[streamed]], extra) - nativeChatModelReservation([[complete]], extra))
        ).toBeLessThan(64)
        expect(nativeChatModelReservation([[streamed]], extra)).toBeGreaterThan(30000)
        const mismatched = new AIMessageChunk({
            ...fields,
            tool_call_chunks: [{ name: call.name, id: call.id, index: 0, args: '{invalid' }]
        })
        expect(nativeChatModelReservation([[mismatched]], extra)).toBe(
            Buffer.byteLength(JSON.stringify({ input: [mismatched.toDict()], parameters: extra.invocation_params })) +
                64 +
                256 +
                1024
        )
        expect(streamed.tool_call_chunks[0].args).toBe(JSON.stringify(call.args))
    })
    it('includes Unicode input, tool calls, tool results and tool definitions', () => {
        const messages = [
            [
                new HumanMessage('验证 CSV'),
                new AIMessage({
                    content: '',
                    tool_calls: [{ name: 'inspect', args: { csv: 'name,value\n甲,1' }, id: 'call' }]
                }),
                new ToolMessage({ content: 'result'.repeat(1000), tool_call_id: 'call' })
            ]
        ]
        const plain = nativeChatModelReservation(messages, extra)
        const withTools = nativeChatModelReservation(messages, {
            invocation_params: {
                ...extra.invocation_params,
                tools: [
                    {
                        type: 'function',
                        function: {
                            name: 'inspect',
                            parameters: { type: 'object', description: 'schema'.repeat(1000) }
                        }
                    }
                ]
            }
        })
        expect(plain).toBeGreaterThan(6000)
        expect(withTools).toBeGreaterThan(plain + 6000)
    })
    it('scales with a large current input and output cap instead of reserving a fixed 10k', () => {
        const value = nativeLLMReservation(['x'.repeat(100_000)], {
            invocation_params: { max_completion_tokens: 32_000 }
        })
        expect(value).toBeGreaterThan(132_000)
    })
    it.each(['max_tokens', 'max_completion_tokens', 'max_output_tokens', 'maxTokens', 'maxOutputTokens'])(
        'supports explicit provider output cap %s',
        (key) => {
            expect(nativeLLMReservation(['text'], { invocation_params: { [key]: 2000 } })).toBeGreaterThan(2000)
        }
    )
    it('includes multiple output candidates and nested generation configuration', () => {
        expect(
            nativeLLMReservation(['text'], {
                invocation_params: {
                    generationConfig: { maxOutputTokens: 3000 },
                    n: 2
                }
            })
        ).toBeGreaterThan(6000)
    })
    it.each([
        undefined,
        {},
        { invocation_params: {} },
        { invocation_params: { max_tokens: -1 } },
        { invocation_params: { max_tokens: 0 } },
        { invocation_params: { max_tokens: '1024' } }
    ])('leaves an unbounded or invalid request unestimable', (parameters) => {
        expect(nativeLLMReservation(['text'], parameters)).toBeUndefined()
    })
    it('accepts text blocks but does not pretend remote image content is its URL token count', () => {
        expect(
            nativeChatModelReservation([[new HumanMessage({ content: [{ type: 'text', text: 'text' }] })]], extra)
        ).toBeGreaterThan(1024)
        expect(
            nativeChatModelReservation(
                [
                    [
                        new HumanMessage({
                            content: [{ type: 'image_url', image_url: { url: 'https://example.test/image.png' } }]
                        })
                    ]
                ],
                extra
            )
        ).toBeUndefined()
    })
})
