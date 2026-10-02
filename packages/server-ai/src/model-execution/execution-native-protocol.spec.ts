import { NativeStreamUsage, nativeFrames, parseNativeRequest, readNativeUsage } from './execution-native-protocol'

describe('native execution protocol', () => {
    it('retains native reasoning, custom tools and explicit multi-turn tool outputs without translation', () => {
        const body = {
            model: 'assistant-default',
            stream: true,
            store: false,
            input: [
                { type: 'reasoning', encrypted_content: 'opaque-signature' },
                { type: 'custom_tool_call_output', call_id: 'call_a', output: 'patch applied' }
            ],
            tools: [
                {
                    type: 'custom',
                    name: 'apply_patch',
                    format: { type: 'grammar', syntax: 'lark', definition: 'start: "x"' }
                }
            ],
            reasoning: { effort: 'high', summary: 'auto' }
        }
        expect(parseNativeRequest(body, 'openai_responses')).toEqual(body)
    })
    it.each([
        { previous_response_id: 'other-user-response' },
        { conversation: 'other-conversation' },
        { store: true },
        { background: true },
        { input: [{ type: 'item_reference', id: 'other-item' }] },
        { input: [{ role: 'user', content: [{ type: 'input_file', file_id: 'other-file' }] }] },
        { tools: [{ type: 'web_search' }] }
    ])('rejects unowned provider state and unmetered hosted operations %j', (patch) => {
        expect(() => parseNativeRequest({ model: 'm', input: 'x', ...patch }, 'openai_responses')).toThrow()
    })
    it('retains Anthropic signatures, tool blocks and cache controls', () => {
        const body = {
            model: 'm',
            messages: [
                {
                    role: 'assistant',
                    content: [
                        { type: 'thinking', thinking: 'reasoning', signature: 'signed' },
                        { type: 'tool_use', id: 'tool', name: 'read_file', input: { path: 'test.py' } }
                    ]
                },
                {
                    role: 'user',
                    content: [
                        {
                            type: 'tool_result',
                            tool_use_id: 'tool',
                            content: 'result',
                            cache_control: { type: 'ephemeral' }
                        }
                    ]
                }
            ],
            thinking: { type: 'enabled', budget_tokens: 1000 },
            max_tokens: 2000
        }
        expect(parseNativeRequest(body, 'anthropic_messages')).toEqual({ ...body, stream: false })
    })
    it('uses cumulative native actual counts without counting cache or reasoning twice', () => {
        expect(
            readNativeUsage(
                {
                    id: 'response',
                    usage: {
                        input_tokens: 100,
                        output_tokens: 30,
                        total_tokens: 130,
                        input_tokens_details: { cached_tokens: 80 },
                        output_tokens_details: { reasoning_tokens: 20 }
                    }
                },
                'openai_responses'
            )
        ).toMatchObject({
            usage: {
                promptTokens: 100,
                completionTokens: 30,
                totalTokens: 130,
                cacheReadInputTokens: 80,
                reasoningTokens: 20
            }
        })
        const stream = new NativeStreamUsage('anthropic_messages')
        stream.accept({
            type: 'message_start',
            message: {
                id: 'msg',
                usage: {
                    input_tokens: 10,
                    output_tokens: 0,
                    cache_read_input_tokens: 80,
                    cache_creation_input_tokens: 10,
                    cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 10 }
                }
            }
        })
        stream.accept({ type: 'message_delta', usage: { output_tokens: 10 } })
        expect(stream.receipt).toBeNull()
        stream.accept({ type: 'message_delta', usage: { output_tokens: 30 } })
        stream.accept({ type: 'message_stop' })
        expect(stream.receipt).toMatchObject({
            usage: {
                promptTokens: 100,
                completionTokens: 30,
                totalTokens: 130,
                cacheReadInputTokens: 80,
                cacheWriteInputTokens: 10
            },
            pricingContext: { cacheWriteInputTokensByTtl: { '5m': 0, '1h': 10 } }
        })
    })
    it('never invents actual facts for empty, invalid or interrupted streams', () => {
        expect(
            readNativeUsage({ usage: { input_tokens: 0, output_tokens: 0, total_tokens: 0 } }, 'openai_responses')
        ).toBeNull()
        expect(
            readNativeUsage({ usage: { input_tokens: -1, output_tokens: 5, total_tokens: 4 } }, 'openai_responses')
        ).toBeNull()
        expect(new NativeStreamUsage('anthropic_messages').receipt).toBeNull()
    })
    it.each([
        { object: 'response', status: 'completed', error: { message: 'private-provider-error' } },
        { object: 'response', status: 'failed' },
        { object: 'response', status: 'incomplete' },
        { object: 'unrelated', status: 'completed' }
    ])('rejects an inconsistent success event before it can be forwarded: %j', (response) => {
        const stream = new NativeStreamUsage('openai_responses')
        expect(() =>
            stream.accept({
                type: 'response.completed',
                response: { ...response, usage: { input_tokens: 10, output_tokens: 2, total_tokens: 12 } }
            })
        ).toThrow()
        expect(stream.failed).toBe(true)
        // Actual usage is still retained for settlement even when delivery is rejected.
        expect(stream.receipt?.usage.totalTokens).toBe(12)
    })
    it.each(['completed', 'incomplete'] as const)('accepts a consistent response.%s envelope', (status) => {
        const stream = new NativeStreamUsage('openai_responses')
        stream.accept({
            type: `response.${status}`,
            response: {
                object: 'response',
                status,
                error: null,
                usage: { input_tokens: 10, output_tokens: 2, total_tokens: 12 }
            }
        })
        expect(stream.failed).toBe(false)
        expect(stream.ended).toBe(true)
        expect(stream.receipt?.usage.totalTokens).toBe(12)
    })
    it('preserves UTF-8 and SSE events across split CRLF boundaries and rejects truncated frames', async () => {
        const text =
            'event: response.output_text.delta\r\ndata: {"type":"response.output_text.delta","delta":"你好"}\r\n\r\n'
        const bytes = new TextEncoder().encode(text)
        const stream = new ReadableStream<Uint8Array>({
            start(controller) {
                for (const byte of bytes) controller.enqueue(Uint8Array.of(byte))
                controller.close()
            }
        })
        const frames = []
        for await (const frame of nativeFrames(stream)) frames.push(frame)
        expect(frames).toHaveLength(1)
        expect(frames[0].value).toEqual({ type: 'response.output_text.delta', delta: '你好' })
        const broken = new ReadableStream<Uint8Array>({
            start(controller) {
                controller.enqueue(bytes.slice(0, -4))
                controller.close()
            }
        })
        await expect(
            (async () => {
                for await (const _ of nativeFrames(broken)) {
                    /* drain */
                }
            })()
        ).rejects.toThrow()
    })
})
