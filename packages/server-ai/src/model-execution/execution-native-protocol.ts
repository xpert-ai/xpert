// Invariants: preserve native items and opaque reasoning content. Only stateless, client-executed tools are admitted.
// Provider-stored IDs and hosted tools require separate ownership/billing capabilities and fail closed here.
import { z } from 'zod/v3'
import type { LLMPriceContext, TTokenUsage } from '@xpert-ai/contracts'
import {
    normalizeTokenUsage,
    type NativeModelBody,
    type NativeModelJson,
    type NativeModelProtocol
} from '@xpert-ai/plugin-sdk'
import { executionError } from './execution-errors'

const json: z.ZodType<NativeModelJson> = z.lazy(() =>
    z.union([z.null(), z.boolean(), z.number().finite(), z.string(), z.array(json), z.record(json)])
)
const envelope = z.record(json)
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const responsesUsage = z.object({
    input_tokens: count,
    output_tokens: count,
    total_tokens: count,
    input_tokens_details: z.object({ cached_tokens: count.optional() }).optional(),
    output_tokens_details: z.object({ reasoning_tokens: count.optional() }).optional()
})
const anthropicInput = z.object({
    input_tokens: count,
    cache_read_input_tokens: count.optional(),
    cache_creation_input_tokens: count.optional(),
    cache_creation: z
        .object({
            ephemeral_5m_input_tokens: count,
            ephemeral_1h_input_tokens: count
        })
        .optional()
})
const anthropicUsage = anthropicInput.extend({ output_tokens: count })
const object = (value: NativeModelJson | undefined): value is NativeModelBody =>
    !!value && typeof value === 'object' && !Array.isArray(value)

function assertInlineInput(value: NativeModelJson, depth = 0) {
    if (depth > 64) throw executionError('Invalid')
    if (Array.isArray(value)) return value.forEach((item) => assertInlineInput(item, depth + 1))
    if (!object(value)) return
    if (
        ['item_reference', 'file', 'input_file', 'image', 'input_image', 'input_audio', 'document'].includes(
            String(value.type)
        ) ||
        value.file_id !== undefined
    )
        throw executionError('Invalid')
    for (const item of Object.values(value)) assertInlineInput(item, depth + 1)
}
export function parseNativeRequest(body: unknown, protocol: NativeModelProtocol) {
    const parsed = envelope.safeParse(body)
    if (!parsed.success) throw executionError('Invalid')
    const result = parsed.data
    if (
        typeof result.model !== 'string' ||
        !result.model ||
        (result.stream !== undefined && typeof result.stream !== 'boolean')
    )
        throw executionError('Invalid')
    if (protocol === 'openai_responses') {
        if (
            result.store === true ||
            result.background === true ||
            result.previous_response_id != null ||
            result.conversation != null ||
            !(typeof result.input === 'string' || Array.isArray(result.input))
        )
            throw executionError('Invalid')
        result.store = false
        assertInlineInput(result.input)
    } else {
        if (!Array.isArray(result.messages)) throw executionError('Invalid')
        assertInlineInput(result.messages)
    }
    if (result.tools !== undefined) {
        if (
            !Array.isArray(result.tools) ||
            result.tools.some(
                (tool) =>
                    !object(tool) ||
                    (protocol === 'openai_responses'
                        ? !['function', 'custom'].includes(String(tool.type))
                        : tool.type !== undefined && tool.type !== 'custom')
            )
        )
            throw executionError('Invalid')
    }
    return { ...result, model: result.model, stream: result.stream === true }
}

export interface NativeUsageReceipt {
    usage: TTokenUsage
    pricingContext?: LLMPriceContext
    providerRequestId?: string
}
function anthropicReceipt(value: unknown, providerRequestId?: string): NativeUsageReceipt | null {
    const parsed = anthropicUsage.safeParse(value)
    if (!parsed.success) return null
    const u = parsed.data
    const input = u.input_tokens + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0)
    const usage = normalizeTokenUsage({
        promptTokens: input,
        completionTokens: u.output_tokens,
        totalTokens: input + u.output_tokens,
        cacheReadInputTokens: u.cache_read_input_tokens,
        cacheWriteInputTokens: u.cache_creation_input_tokens
    })
    if (!usage) return null
    return {
        usage,
        providerRequestId,
        ...(u.cache_creation
            ? {
                  pricingContext: {
                      cacheWriteInputTokensByTtl: {
                          '5m': u.cache_creation.ephemeral_5m_input_tokens,
                          '1h': u.cache_creation.ephemeral_1h_input_tokens
                      }
                  }
              }
            : {})
    }
}
function responsesReceipt(value: unknown, providerRequestId?: string): NativeUsageReceipt | null {
    const parsed = responsesUsage.safeParse(value)
    if (!parsed.success) return null
    const u = parsed.data
    const usage = normalizeTokenUsage({
        promptTokens: u.input_tokens,
        completionTokens: u.output_tokens,
        totalTokens: u.total_tokens,
        cacheReadInputTokens: u.input_tokens_details?.cached_tokens,
        reasoningTokens: u.output_tokens_details?.reasoning_tokens
    })
    return usage ? { usage, providerRequestId } : null
}
const receiptEnvelope = z.object({ id: z.string().max(256).optional(), usage: z.unknown() })
export function readNativeUsage(value: unknown, protocol: NativeModelProtocol) {
    const result = receiptEnvelope.safeParse(value)
    if (!result.success) return null
    return protocol === 'openai_responses'
        ? responsesReceipt(result.data.usage, result.data.id)
        : anthropicReceipt(result.data.usage, result.data.id)
}

/** Never forward raw provider error envelopes, including errors carried in a successful HTTP response. */
export function assertNativeResponse(value: unknown, protocol: NativeModelProtocol) {
    const result = z
        .object({
            error: z.unknown().optional(),
            type: z.string().optional(),
            status: z.string().optional(),
            object: z.string().optional()
        })
        .safeParse(value)
    if (
        !result.success ||
        result.data.error != null ||
        result.data.type === 'error' ||
        (protocol === 'openai_responses'
            ? result.data.object !== 'response' || !['completed', 'incomplete'].includes(result.data.status ?? '')
            : result.data.type !== 'message')
    )
        throw executionError('Unavailable')
    return result.data
}

/** Anthropic input and cumulative output counts live in different events of the same message. */
export class NativeStreamUsage {
    private input: z.infer<typeof anthropicInput> | undefined
    private output: number | undefined
    private messageId: string | undefined
    receipt: NativeUsageReceipt | null = null
    failed = false
    ended = false
    constructor(private readonly protocol: NativeModelProtocol) {}
    accept(value: unknown) {
        const event = z
            .object({
                type: z.string(),
                response: z.unknown().optional(),
                message: z.unknown().optional(),
                usage: z.unknown().optional()
            })
            .safeParse(value)
        if (!event.success) throw executionError('Invalid')
        const e = event.data
        if (e.type === 'error') {
            this.failed = true
            throw executionError('Unavailable')
        }
        if (this.protocol === 'openai_responses') {
            if (['response.completed', 'response.incomplete', 'response.failed'].includes(e.type)) {
                if (this.ended) throw executionError('Invalid')
                this.ended = true
                this.failed = e.type === 'response.failed'
                this.receipt = readNativeUsage(e.response, this.protocol)
                if (!this.failed) {
                    try {
                        const response = assertNativeResponse(e.response, this.protocol)
                        const expectedStatus = e.type === 'response.completed' ? 'completed' : 'incomplete'
                        if (response.status !== expectedStatus) throw executionError('Unavailable')
                    } catch (error) {
                        this.failed = true
                        throw error
                    }
                }
            }
        } else if (e.type === 'message_start') {
            if (this.input) throw executionError('Invalid')
            const message = receiptEnvelope.parse(e.message)
            this.messageId = message.id
            this.input = anthropicInput.parse(message.usage)
        } else if (e.type === 'message_delta') {
            this.output = z.object({ output_tokens: count }).parse(e.usage).output_tokens
        } else if (e.type === 'message_stop') {
            if (this.ended) throw executionError('Invalid')
            this.ended = true
            this.receipt = anthropicReceipt({ ...this.input, output_tokens: this.output }, this.messageId)
        }
    }
}

/** Bound both frame and total response memory while keeping native SSE events intact. */
export async function* nativeFrames(stream: ReadableStream<Uint8Array>) {
    const reader = stream.getReader(),
        decoder = new TextDecoder('utf-8', { fatal: true })
    let pending = '',
        bytes = 0
    try {
        for (;;) {
            const { value, done } = await reader.read()
            if (done) break
            bytes += value.byteLength
            if (bytes > 16 * 1024 * 1024) throw executionError('Invalid')
            pending += decoder.decode(value, { stream: true })
            pending = pending.replace(/\r\n/g, '\n')
            let index: number
            while ((index = pending.indexOf('\n\n')) !== -1) {
                const raw = pending.slice(0, index + 2)
                pending = pending.slice(index + 2)
                if (raw.length > 2 * 1024 * 1024) throw executionError('Invalid')
                const data = raw
                    .split('\n')
                    .filter((line) => line.startsWith('data:'))
                    .map((line) => line.slice(5).trimStart())
                    .join('\n')
                yield { raw, value: data && data !== '[DONE]' ? JSON.parse(data) : undefined }
            }
            if (pending.length > 2 * 1024 * 1024) throw executionError('Invalid')
        }
        pending += decoder.decode()
        if (pending.trim()) throw executionError('Unavailable')
    } finally {
        await reader.cancel().catch(() => undefined)
        reader.releaseLock()
    }
}
