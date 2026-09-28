import { load } from '@langchain/core/load'
import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages'
import { MemorySaver, type SerializerProtocol } from '@langchain/langgraph-checkpoint'
import { Send } from '@langchain/langgraph'
import { JsonPlusSerializer } from './jsonplus'
import { MessageStateSerializer } from './message-state'

describe.each<[string, () => SerializerProtocol]>([
    ['application', () => new JsonPlusSerializer()],
    ['graph', () => new MessageStateSerializer(new MemorySaver().serde)]
])('%s serializer message constructor arguments', (_name, createSerializer) => {
    const serializer = createSerializer()

    async function legacyPrunedMessage() {
        const original = new ToolMessage({
            id: 'result-1',
            name: 'read_file',
            tool_call_id: 'call-1',
            content: 'STALE_OUTPUT\n'.repeat(10000),
            status: 'success',
            metadata: { path: '/workspace/input.txt' },
            artifact: { image: 'data:image/png;base64,dGVzdA==' },
            additional_kwargs: { custom: { lc_kwargs: 'business data', lcKwargs: 'also business data' } },
            response_metadata: { duration: 12 }
        })
        // Reproduce the old spread/reload path, including the camelCase alias.
        const pruned = new ToolMessage({ ...original, content: '[Old tool output cleared. Tool: read_file]' })
        const restored = await load<ToolMessage>(JSON.stringify(pruned))
        return new ToolMessage({ ...restored })
    }

    it('discards legacy constructor copies before restoring a checkpoint message', async () => {
        const legacy = await legacyPrunedMessage()
        const checkpoint = JSON.stringify({ channel_values: { agent: { messages: [legacy] } } })
        expect(checkpoint.length).toBeGreaterThan(100000)
        const restored: { channel_values: { agent: { messages: ToolMessage[] } } } = await serializer.loadsTyped(
            'json',
            checkpoint
        )
        const message = restored.channel_values.agent.messages[0]

        expect(message).toBeInstanceOf(ToolMessage)
        expect(JSON.stringify(message).length).toBeLessThan(2000)
        expect(JSON.stringify(message)).not.toContain('STALE_OUTPUT')
        expect(message).toMatchObject({
            id: legacy.id,
            name: legacy.name,
            content: legacy.content,
            tool_call_id: legacy.tool_call_id,
            status: legacy.status,
            metadata: legacy.metadata,
            artifact: legacy.artifact,
            additional_kwargs: legacy.additional_kwargs,
            response_metadata: legacy.response_metadata
        })
        expect(JSON.stringify(legacy)).toContain('STALE_OUTPUT')
    })

    it('omits legacy copies when writing pending message updates', async () => {
        const legacy = await legacyPrunedMessage()
        const [type, data] = await serializer.dumpsTyped({ messages: [legacy] })
        const json = new TextDecoder().decode(data)

        expect(type).toBe('json')
        expect(data.byteLength).toBeLessThan(2000)
        expect(json).not.toContain('STALE_OUTPUT')
        const restored: { messages: ToolMessage[] } = await serializer.loadsTyped(type, data)
        expect(restored.messages[0].content).toBe(legacy.content)
        expect(restored.messages[0].artifact).toEqual(legacy.artifact)
        expect(restored.messages[0].additional_kwargs).toEqual(legacy.additional_kwargs)
    })

    it('preserves multimodal content and separate calls with identical arguments', async () => {
        const messages = [
            new HumanMessage({
                id: 'human-1',
                content: [
                    { type: 'text', text: 'Inspect this' },
                    { type: 'image_url', image_url: { url: 'data:image/png;base64,dGVzdA==' } },
                    { type: 'file', file: { file_id: 'file-1' } }
                ]
            }),
            new AIMessage({
                id: 'answer-1',
                content: '',
                tool_calls: ['call-1', 'call-2'].map((id) => ({
                    id,
                    name: 'read_file',
                    args: { path: '/workspace/input.txt', lc_kwargs: 'application parameter' }
                })),
                additional_kwargs: { reasoning_content: 'Read both results' }
            })
        ]
        const [type, data] = await serializer.dumpsTyped({ messages })
        const restored: { messages: Array<HumanMessage | AIMessage> } = await serializer.loadsTyped(type, data)

        expect(restored.messages[0]).toBeInstanceOf(HumanMessage)
        expect(restored.messages[0].content).toEqual(messages[0].content)
        expect(restored.messages[1]).toBeInstanceOf(AIMessage)
        expect(restored.messages[1]).toMatchObject({
            tool_calls: [
                { id: 'call-1', args: { path: '/workspace/input.txt', lc_kwargs: 'application parameter' } },
                { id: 'call-2', args: { path: '/workspace/input.txt', lc_kwargs: 'application parameter' } }
            ],
            additional_kwargs: { reasoning_content: 'Read both results' }
        })
    })

    it('does not remove similarly named fields from ordinary state or unrelated constructor envelopes', async () => {
        const state = {
            lc_kwargs: { content: 'business data' },
            lcKwargs: { content: 'also business data' },
            records: [
                {
                    lc: 0,
                    type: 'constructor',
                    id: ['langchain_core', 'messages', 'AIMessage'],
                    kwargs: { lc_kwargs: 1 }
                },
                { lc: 2, type: 'constructor', id: ['application', 'messages', 'AIMessage'], kwargs: { lcKwargs: 2 } }
            ]
        }
        const [type, data] = await serializer.dumpsTyped(state)
        expect(await serializer.loadsTyped(type, data)).toEqual(state)
    })

    it('passes binary data through unchanged', async () => {
        const bytes = new TextEncoder().encode('{"lc_kwargs":"binary content"}')
        const [type, data] = await serializer.dumpsTyped(bytes)
        expect(type).toBe('bytes')
        expect(data).toBe(bytes)
        expect(await serializer.loadsTyped(type, data)).toBe(bytes)
    })
})

describe('graph serializer compatibility', () => {
    it('retains the native encoding and restoration of graph sends, containers and circular data', async () => {
        const native = new MemorySaver().serde
        const serializer = new MessageStateSerializer(native)
        const circular: { value: string; self?: object } = { value: 'circular' }
        circular.self = circular
        const state = {
            send: new Send('worker', { item: 1 }),
            set: new Set(['one', undefined]),
            map: new Map([['one', 1]]),
            pattern: /example/gi,
            error: new Error('test failure'),
            empty: undefined,
            circular,
            lc_kwargs: 'business field triggers the compatibility check'
        }
        const [nativeType, nativeData] = await native.dumpsTyped(state)
        const [type, data] = await serializer.dumpsTyped(state)

        expect(type).toBe(nativeType)
        expect(data).toEqual(nativeData)
        expect(await serializer.loadsTyped(type, data)).toEqual(await native.loadsTyped(nativeType, nativeData))
        expect(circular.self).toBe(circular)
    })
})
