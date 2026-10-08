import { EventEmitter } from 'node:events'
import type { Response } from 'express'
import { ModelGatewayUsageSourceEnum } from '@xpert-ai/contracts'
import { parseChatBridgeRequest, type ChatBridgeRequest } from './execution-chat-bridge-request'
import { ChatBridgeWriter } from './execution-chat-bridge-writer'
import { toLangChainMessages, type OpenAIResponseToolCall } from '../model-gateway/openai-adapter'

const actual = {
    inputTokens: 20,
    outputTokens: 5,
    totalTokens: 25,
    source: ModelGatewayUsageSourceEnum.Provider,
    cacheReadInputTokens: 4
}
function fixture(protocol: 'openai_responses' | 'anthropic_messages', stream = true, bridge?: ChatBridgeRequest) {
    const data: string[] = [],
        abort = new AbortController()
    const response = Object.assign(new EventEmitter(), {
        destroyed: false,
        writableEnded: false,
        status: jest.fn(),
        setHeader: jest.fn(),
        flushHeaders: jest.fn(),
        write: jest.fn((value: string) => {
            data.push(value)
            return true
        }),
        end: jest.fn(),
        json: jest.fn()
    })
    response.status.mockReturnValue(response)
    const writer = new ChatBridgeWriter(
        response as unknown as Response,
        abort.signal,
        protocol,
        stream,
        bridge?.customTools ?? new Set(['patch']),
        bridge?.toolNames
    )
    const base = { id: 'test', model: 'assistant-default', created: 1 }
    return { writer, response, abort, base, events: () => data.map((line) => JSON.parse(line.split('\ndata: ')[1])) }
}
describe('explicit Chat protocol translation', () => {
    it('round trips multiple Responses function calls and outputs without changing call IDs', () => {
        const { parsed } = parseChatBridgeRequest(
            {
                model: 'alias',
                input: [
                    { role: 'user', content: 'test' },
                    { type: 'function_call', call_id: 'call_a', name: 'read', arguments: '{"path":"a"}' },
                    { type: 'function_call', call_id: 'call_b', name: 'read', arguments: '{"path":"b"}' },
                    { type: 'function_call_output', id: 'item-id', call_id: 'call_a', output: 'A' },
                    {
                        type: 'function_call_output',
                        id: 'item-id',
                        call_id: 'call_b',
                        output: [{ type: 'input_text', text: 'B' }]
                    }
                ]
            },
            'openai_responses'
        )
        expect(parsed.messages[1].toolCalls).toHaveLength(2)
        expect(parsed.messages.slice(2).map((m) => m.toolCallId)).toEqual(['call_a', 'call_b'])
        expect(toLangChainMessages(parsed.messages)).toHaveLength(4)
    })
    it('translates Claude tool results in order and preserves errors and system text', () => {
        const { parsed } = parseChatBridgeRequest(
            {
                model: 'alias',
                max_tokens: 10,
                system: [{ type: 'text', text: 'system', cache_control: { type: 'ephemeral' } }],
                messages: [
                    {
                        role: 'assistant',
                        content: [
                            { type: 'text', text: 'work' },
                            { type: 'tool_use', id: 'a', name: 'read', input: {} }
                        ]
                    },
                    {
                        role: 'user',
                        content: [
                            { type: 'tool_result', tool_use_id: 'a', content: 'missing', is_error: true },
                            { type: 'text', text: 'try again' }
                        ]
                    }
                ]
            },
            'anthropic_messages'
        )
        expect(parsed.messages.map((m) => m.role)).toEqual(['system', 'assistant', 'tool', 'user'])
        expect(parsed.messages[2].content).toBe('Tool error:\nmissing')
        expect(toLangChainMessages(parsed.messages)).toHaveLength(4)
    })
    it.each([
        { previous_response_id: 'someone-elses-response' },
        { store: true },
        { reasoning: { effort: 'high' } },
        { input: [{ type: 'reasoning', encrypted_content: 'opaque' }] },
        { tools: [{ type: 'web_search' }] },
        { service_tier: 'priority' },
        { input: [{ role: 'user', content: [{ type: 'input_image', image_url: 'https://example.test/image' }] }] },
        { tools: [{ type: 'custom', name: 'patch', format: { type: 'grammar', syntax: 'lark', definition: '...' } }] }
    ])('rejects unsupported Responses semantics before provider work: %j', (options) => {
        expect(() => parseChatBridgeRequest({ model: 'alias', input: 'x', ...options }, 'openai_responses')).toThrow()
    })
    it.each([
        { thinking: { type: 'enabled', budget_tokens: 100 } },
        { safeguards: [{ type: 'dangerous_tool_use' }] },
        { messages: [{ role: 'assistant', content: [{ type: 'thinking', thinking: 'opaque', signature: 'signed' }] }] },
        { output_config: { effort: 'high' } },
        { tools: [{ type: 'web_search_20250305', name: 'web_search' }] }
    ])('rejects unsupported Claude semantics, including server safeguards: %j', (options) => {
        expect(() =>
            parseChatBridgeRequest(
                { model: 'alias', max_tokens: 10, messages: [{ role: 'user', content: 'x' }], ...options },
                'anthropic_messages'
            )
        ).toThrow()
    })
    it.each(['openai_responses', 'anthropic_messages'] as const)(
        'emits complete %s tool streams and actual usage once',
        async (protocol) => {
            const f = fixture(protocol)
            await f.writer.start(f.base)
            await f.writer.delta('hello ', [
                { index: 0, id: 'a', type: 'function', function: { name: 'read', arguments: '{"path":' } }
            ])
            await f.writer.delta('world', [{ index: 0, type: 'function', function: { arguments: '"file"}' } }])
            await f.writer.complete({ base: f.base, text: 'hello world', reason: 'tool_calls', usage: actual })
            const events = f.events()
            if (protocol === 'openai_responses') {
                const last = events.at(-1)
                expect(last.type).toBe('response.completed')
                expect(last.response.output[1]).toMatchObject({
                    call_id: 'a',
                    name: 'read',
                    arguments: '{"path":"file"}'
                })
                expect(last.response.usage).toMatchObject({ input_tokens: 20, output_tokens: 5, total_tokens: 25 })
                expect(events.map((e) => e.sequence_number)).toEqual(events.map((_, i) => i))
            } else {
                expect(events.at(-1).type).toBe('message_stop')
                expect(events.at(-2).usage).toMatchObject({
                    input_tokens: 16,
                    cache_read_input_tokens: 4,
                    output_tokens: 5
                })
                expect(events.find((e) => e.type === 'content_block_delta' && e.index === 1).delta.partial_json).toBe(
                    '{"path":"file"}'
                )
            }
            expect(f.response.end).toHaveBeenCalledTimes(1)
        }
    )
    it('reports length truncation instead of success and never fabricates reasoning', async () => {
        const f = fixture('openai_responses', false)
        await f.writer.complete({ base: f.base, text: 'partial', tools: [], reason: 'length', usage: actual })
        expect(f.response.json).toHaveBeenCalledWith(
            expect.objectContaining({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' } })
        )
        expect(JSON.stringify(f.response.json.mock.calls)).not.toContain('encrypted_content')
    })
    it('does not emit a successful protocol final event for estimated usage or cancelled output', async () => {
        const f = fixture('openai_responses')
        await f.writer.start(f.base)
        await expect(
            f.writer.complete({
                base: f.base,
                text: '',
                reason: 'stop',
                usage: { ...actual, source: ModelGatewayUsageSourceEnum.Estimated }
            })
        ).rejects.toThrow()
        f.abort.abort()
        await expect(f.writer.delta('cancelled', [])).rejects.toThrow()
        expect(f.events().some((e) => e.type === 'response.completed')).toBe(false)
    })
})

describe('Responses client tool namespaces', () => {
    const tool = { type: 'function', name: 'js', parameters: { type: 'object' }, strict: false }
    const tools = [
        tool,
        { type: 'namespace', name: 'mcp__node_repl', description: 'Execute JavaScript locally', tools: [tool] },
        { type: 'namespace', name: 'other', tools: [{ type: 'custom', name: 'js', format: { type: 'text' } }] }
    ]
    const request = {
        model: 'assistant-default',
        input: 'test',
        tools,
        store: false,
        stream: true,
        reasoning: {},
        include: ['reasoning.encrypted_content'],
        client_metadata: { originator: 'codex_cli_rs' }
    }
    it.each([true, false])(
        'round trips same-named grouped function/custom tools and history (stream=%s)',
        async (stream) => {
            const bridge = parseChatBridgeRequest(request, 'openai_responses')
            const names = bridge.parsed.tools.map((tool) => tool.function.name)
            expect(new Set(names).size).toBe(3)
            expect(names[0]).toBe('js')
            expect(names.every((name) => /^[a-zA-Z0-9_-]{1,64}$/.test(name))).toBe(true)
            expect(bridge.parsed.tools[1].function.description).toContain('Execute JavaScript locally')
            const calls: OpenAIResponseToolCall[] = [
                { id: 'plain', type: 'function', function: { name: names[0], arguments: '{"code":"1"}' } },
                { id: 'grouped', type: 'function', function: { name: names[1], arguments: '{"code":"2"}' } },
                { id: 'custom', type: 'function', function: { name: names[2], arguments: '{"input":"3"}' } }
            ]
            const f = fixture('openai_responses', stream, bridge)
            if (stream) {
                await f.writer.start(f.base)
                await f.writer.delta(
                    '',
                    calls.map((call, index) => ({ ...call, index }))
                )
            }
            await f.writer.complete({ base: f.base, text: '', tools: calls, reason: 'tool_calls', usage: actual })
            const response = stream ? f.events().at(-1).response : f.response.json.mock.calls[0][0]
            expect(response.output).toMatchObject([
                { type: 'function_call', call_id: 'plain', name: 'js', arguments: '{"code":"1"}' },
                {
                    type: 'function_call',
                    call_id: 'grouped',
                    namespace: 'mcp__node_repl',
                    name: 'js',
                    arguments: '{"code":"2"}'
                },
                { type: 'custom_tool_call', call_id: 'custom', namespace: 'other', name: 'js', input: '3' }
            ])
            expect(response.output[0]).not.toHaveProperty('namespace')
            if (stream) {
                expect(
                    f
                        .events()
                        .filter((e) => e.type === 'response.output_item.added')
                        .map((e) => e.item.namespace)
                ).toEqual([undefined, 'mcp__node_repl', 'other'])
            }
            const next = parseChatBridgeRequest(
                {
                    ...request,
                    tools: [...tools].reverse(),
                    input: [
                        ...response.output,
                        { type: 'function_call_output', call_id: 'plain', output: 'one' },
                        { type: 'function_call_output', call_id: 'grouped', output: 'two' },
                        { type: 'custom_tool_call_output', call_id: 'custom', output: 'three' }
                    ]
                },
                'openai_responses'
            )
            expect(next.parsed.messages[0].toolCalls).toEqual(calls)
            expect(next.parsed.messages.slice(1).map((item) => item.toolCallId)).toEqual(['plain', 'grouped', 'custom'])
            expect(response.usage.total_tokens).toBe(25)
        }
    )
    it('maps explicit tool choice and historical names even after tools are removed', () => {
        const first = parseChatBridgeRequest(request, 'openai_responses')
        const next = parseChatBridgeRequest(
            {
                ...request,
                tools: [],
                input: [
                    { type: 'function_call', call_id: 'a', namespace: 'mcp__node_repl', name: 'js', arguments: '{}' }
                ],
                tool_choice: { type: 'function', namespace: 'mcp__node_repl', name: 'js' }
            },
            'openai_responses'
        )
        expect(next.parsed.messages[0].toolCalls[0]).toMatchObject({
            function: { name: first.parsed.tools[1].function.name }
        })
        expect(next.parsed.toolChoice).toEqual({
            type: 'function',
            function: { name: first.parsed.tools[1].function.name }
        })
    })
    it('rejects ambiguous aliases and duplicate tool definitions', () => {
        const first = parseChatBridgeRequest(request, 'openai_responses')
        const collision = { ...tool, name: first.parsed.tools[1].function.name }
        for (const candidate of [
            [...tools, collision],
            [collision, ...tools],
            [tool, tool]
        ])
            expect(() => parseChatBridgeRequest({ ...request, tools: candidate }, 'openai_responses')).toThrow()
    })
    it.each([
        { type: 'web_search' },
        { ...tool, strict: true },
        { ...tool, defer_loading: true },
        { type: 'namespace', name: 'nested', tools: [tool] },
        { type: 'custom', name: 'patch', format: { type: 'grammar', syntax: 'lark', definition: '...' } }
    ])('keeps unsupported semantics inside namespaces fail-closed: %j', (child) => {
        expect(() =>
            parseChatBridgeRequest(
                {
                    ...request,
                    tools: [{ type: 'namespace', name: 'mcp', tools: [child] }]
                },
                'openai_responses'
            )
        ).toThrow()
    })
})
