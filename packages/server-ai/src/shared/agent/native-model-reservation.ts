// Admission uses the current request, including tool schemas and its explicit output cap.
// UTF-8 bytes deliberately overestimate text tokens; this is a reservation, never billable usage.
// Opaque media or an omitted output cap cannot safely fall back to the old fixed allowance.
import { isAIMessage, type BaseMessage } from '@langchain/core/messages'
import { isDeepStrictEqual } from 'node:util'
import { z } from 'zod/v3'

const limit = z.number().int().positive().safe().nullish()
const parametersSchema = z
    .object({
        invocation_params: z
            .object({
                max_tokens: limit,
                max_completion_tokens: limit,
                max_output_tokens: limit,
                maxTokens: limit,
                maxOutputTokens: limit,
                generationConfig: z.object({ maxOutputTokens: limit }).passthrough().optional(),
                n: z.number().int().positive().safe().optional()
            })
            .passthrough()
    })
    .passthrough()

function estimate(input: unknown, count: number, extra: unknown): number | undefined {
    const parsed = parametersSchema.safeParse(extra)
    if (!parsed.success) return undefined
    const params = parsed.data.invocation_params
    const caps = [
        params.max_tokens,
        params.max_completion_tokens,
        params.max_output_tokens,
        params.maxTokens,
        params.maxOutputTokens,
        params.generationConfig?.maxOutputTokens
    ].filter((value): value is number => typeof value === 'number')
    if (!caps.length) return undefined
    try {
        // Include all invocation parameters, notably tools/functions and structured-output schemas.
        const bytes = Buffer.byteLength(JSON.stringify({ input, parameters: params }), 'utf8')
        const total = bytes + 64 * count + 256 + Math.max(...caps) * (params.n ?? 1)
        return Number.isSafeInteger(total) ? total : undefined
    } catch {
        return undefined
    }
}

export function nativeChatModelReservation(messages: BaseMessage[][], extra: unknown): number | undefined {
    const flat = messages.flat()
    if (
        flat.some(
            (message) =>
                typeof message.content !== 'string' &&
                !message.content.every((block) => block.type === 'text' && typeof block.text === 'string')
        )
    )
        return undefined
    return estimate(flat.map(reservationMessage), flat.length, extra)
}

/** Completed stream fragments are a transport copy, not another set of model tool calls. */
function reservationMessage(message: BaseMessage) {
    const stored = message.toDict()
    if (!isAIMessage(message) || message.invalid_tool_calls?.length || !('tool_call_chunks' in stored.data))
        return stored
    const chunks = z
        .array(
            z
                .object({
                    id: z.string(),
                    name: z.string(),
                    args: z.string(),
                    index: z.number().int().optional(),
                    type: z.literal('tool_call_chunk').optional()
                })
                .strict()
        )
        .safeParse(stored.data.tool_call_chunks)
    const calls = message.tool_calls
    if (!chunks.success || !calls?.length || chunks.data.length !== calls.length) return stored
    try {
        if (
            !chunks.data.every((chunk, index) => {
                const call = calls[index]
                return (
                    chunk.id === call.id &&
                    chunk.name === call.name &&
                    isDeepStrictEqual(JSON.parse(chunk.args), call.args)
                )
            })
        )
            return stored
    } catch {
        return stored
    }
    // Retain raw provider kwargs, response output/reasoning, signatures, tools and every output cap.
    const { tool_call_chunks: _chunks, ...data } = stored.data
    return { ...stored, data }
}

export function nativeLLMReservation(prompts: string[], extra: unknown): number | undefined {
    return estimate(prompts, prompts.length, extra)
}
