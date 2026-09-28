// Legacy message spreads persisted constructor snapshots inside constructor kwargs.
// Strip only these internal copies; message content and application metadata are opaque.
import type { SerializerProtocol } from '@langchain/langgraph-checkpoint'

const MESSAGE_CONSTRUCTORS = new Set([
    'AIMessage',
    'AIMessageChunk',
    'HumanMessage',
    'HumanMessageChunk',
    'SystemMessage',
    'SystemMessageChunk',
    'FunctionMessage',
    'FunctionMessageChunk',
    'ChatMessage',
    'ChatMessageChunk',
    'ToolMessage',
    'ToolMessageChunk',
    'RemoveMessage'
])

interface SerializedMessage {
    lc: 1
    type: 'constructor'
    id: [string, 'messages', string]
    kwargs: object
}

function isSerializedMessage(value: unknown): value is SerializedMessage {
    return (
        value !== null &&
        typeof value === 'object' &&
        'lc' in value &&
        value.lc === 1 &&
        'type' in value &&
        value.type === 'constructor' &&
        'id' in value &&
        Array.isArray(value.id) &&
        value.id.length === 3 &&
        (value.id[0] === 'langchain_core' || value.id[0] === 'langchain') &&
        value.id[1] === 'messages' &&
        typeof value.id[2] === 'string' &&
        MESSAGE_CONSTRUCTORS.has(value.id[2]) &&
        'kwargs' in value &&
        value.kwargs !== null &&
        typeof value.kwargs === 'object' &&
        !Array.isArray(value.kwargs)
    )
}

function normalizeMessageState(data: Uint8Array | string): Uint8Array | string {
    const source = typeof data === 'string' ? data : Buffer.from(data.buffer, data.byteOffset, data.byteLength)
    // Clean checkpoints take the existing serializer path without another JSON parse.
    if (!source.includes('"lc_kwargs"') && !source.includes('"lcKwargs"')) return data

    const parsed: unknown = JSON.parse(source.toString())
    let changed = false
    const normalized = JSON.stringify(parsed, (_key, value: unknown) => {
        if (!isSerializedMessage(value) || !('lc_kwargs' in value.kwargs || 'lcKwargs' in value.kwargs)) {
            return value
        }
        changed = true
        return {
            ...value,
            kwargs: Object.fromEntries(
                Object.entries(value.kwargs).filter(([key]) => key !== 'lc_kwargs' && key !== 'lcKwargs')
            )
        }
    })
    if (!changed) return data
    return typeof data === 'string' ? normalized : new TextEncoder().encode(normalized)
}

/** Preserve each caller's serializer semantics while repairing legacy message state. */
export class MessageStateSerializer implements SerializerProtocol {
    constructor(private readonly delegate: SerializerProtocol) {}

    async dumpsTyped(value: unknown): Promise<[string, Uint8Array]> {
        const [type, data] = await this.delegate.dumpsTyped(value)
        if (type !== 'json') return [type, data]
        const normalized = normalizeMessageState(data)
        return [type, typeof normalized === 'string' ? new TextEncoder().encode(normalized) : normalized]
    }

    async loadsTyped(type: string, data: Uint8Array | string): ReturnType<SerializerProtocol['loadsTyped']> {
        return this.delegate.loadsTyped(type, type === 'json' ? normalizeMessageState(data) : data)
    }
}
