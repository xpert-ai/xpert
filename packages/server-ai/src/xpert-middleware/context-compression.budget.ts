import { BaseMessage, isAIMessage, isSystemMessage } from '@langchain/core/messages'
import { convertToOpenAITool } from '@langchain/core/utils/function_calling'
import type { IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { TAgentRunnableConfigurable } from '@xpert-ai/contracts'
import { PromptTokenAnchor, PromptWindowEstimate } from './context-compression.shared'

export function estimateTokenCountSync(text: string): number {
    return Math.max(0, Math.ceil((text || '').length / 4))
}

export async function estimateTokens(messages: BaseMessage[]): Promise<number> {
    const totalChars = messages.reduce(
        (sum, msg) =>
            sum +
            JSON.stringify(msg.content).length +
            (isAIMessage(msg) && msg.tool_calls?.length ? JSON.stringify(msg.tool_calls).length : 0),
        0
    )
    return Math.ceil(totalChars / 4)
}

export function toPositiveTokenCount(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
        return Math.round(value)
    }

    if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value)
        if (Number.isFinite(parsed) && parsed >= 0) {
            return Math.round(parsed)
        }
    }

    return null
}

const TokenUsageSchema = z.object({
    total_tokens: z.unknown().optional(),
    prompt_tokens: z.unknown().optional(),
    totalTokens: z.unknown().optional(),
    promptTokens: z.unknown().optional()
})

function parseTokenUsage(value: unknown) {
    const parsed = TokenUsageSchema.safeParse(value)
    return parsed.success ? parsed.data : null
}

export function extractPromptTokenAnchor(message: BaseMessage): PromptTokenAnchor | null {
    if (!isAIMessage(message)) return null
    const usage = parseTokenUsage(message.response_metadata?.usage)
    const tokenUsage = parseTokenUsage(message.response_metadata?.tokenUsage)
    const raw: unknown = message.additional_kwargs?.__raw_response
    const rawUsage = parseTokenUsage(raw && typeof raw === 'object' && 'usage' in raw ? raw.usage : null)
    const candidates: Array<[string, unknown]> = [
        ['response_metadata.usage.total_tokens', usage?.total_tokens],
        ['response_metadata.usage.prompt_tokens', usage?.prompt_tokens],
        ['response_metadata.tokenUsage.totalTokens', tokenUsage?.totalTokens],
        ['response_metadata.tokenUsage.promptTokens', tokenUsage?.promptTokens],
        ['usage_metadata.total_tokens', message.usage_metadata?.total_tokens],
        ['usage_metadata.input_tokens', message.usage_metadata?.input_tokens],
        ['additional_kwargs.__raw_response.usage.total_tokens', rawUsage?.total_tokens],
        ['additional_kwargs.__raw_response.usage.prompt_tokens', rawUsage?.prompt_tokens]
    ]
    for (const [source, value] of candidates) {
        const promptTokens = toPositiveTokenCount(value)
        if (promptTokens !== null) return { index: -1, promptTokens, source }
    }
    return null
}

export function findLatestPromptTokenAnchor(messages: BaseMessage[]): PromptTokenAnchor | null {
    for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].additional_kwargs?.contextCompressionUsageInvalidated === true) continue
        const anchor = extractPromptTokenAnchor(messages[i])
        if (anchor) {
            return {
                ...anchor,
                index: i
            }
        }
    }

    return null
}

export function resolveReservedOutputTokens(
    model: TAgentRunnableConfigurable['copilotModel'],
    tokenLimit: number,
    threshold: number
): { reservedOutputTokens: number; source: string } {
    const modelOptions = model?.options
    const candidates: Array<[string, unknown]> = [
        ['options.max_output_tokens', modelOptions?.['max_output_tokens']],
        ['options.max_completion_tokens', modelOptions?.['max_completion_tokens']],
        ['options.max_tokens', modelOptions?.['max_tokens']],
        ['options.maxTokens', modelOptions?.['maxTokens']],
        ['options.max_tokens_to_sample', modelOptions?.['max_tokens_to_sample']],
        ['options.num_predict', modelOptions?.['num_predict']]
    ]

    for (const [source, value] of candidates) {
        const resolved = toPositiveTokenCount(value)
        if (resolved && resolved > 0) {
            return {
                reservedOutputTokens: Math.min(resolved, tokenLimit),
                source
            }
        }
    }

    const fallbackReservedTokens = Math.max(1, Math.round(tokenLimit * Math.max(0, 1 - threshold)))

    return {
        reservedOutputTokens: Math.min(fallbackReservedTokens, tokenLimit),
        source: 'fallback_from_threshold'
    }
}

export async function estimatePromptWindowUsage(
    messages: BaseMessage[],
    model: TAgentRunnableConfigurable['copilotModel'],
    tokenLimit: number,
    threshold: number,
    fixedInputTokens = 0
): Promise<PromptWindowEstimate> {
    const messageOnlyTokens = await estimateTokens(messages)
    const anchor = findLatestPromptTokenAnchor(messages)

    let deltaMessageTokens = messageOnlyTokens
    let estimatedPromptTokens = messageOnlyTokens + fixedInputTokens

    if (anchor) {
        const subsequentMessages = messages.slice(anchor.index + 1)
        deltaMessageTokens = subsequentMessages.length ? await estimateTokens(subsequentMessages) : 0
        estimatedPromptTokens = Math.max(messageOnlyTokens + fixedInputTokens, anchor.promptTokens + deltaMessageTokens)
    }

    const { reservedOutputTokens, source } = resolveReservedOutputTokens(model, tokenLimit, threshold)
    const availablePromptTokens = Math.max(0, tokenLimit - reservedOutputTokens)
    const thresholdPromptTokens = Math.max(0, Math.round(tokenLimit * Math.max(0, Math.min(1, threshold))))
    const effectivePromptBudget = Math.min(availablePromptTokens, thresholdPromptTokens || availablePromptTokens)

    return {
        fixedInputTokens,
        estimatedPromptTokens,
        reservedOutputTokens,
        availablePromptTokens,
        thresholdPromptTokens,
        effectivePromptBudget,
        projectedTotalTokens: estimatedPromptTokens + reservedOutputTokens,
        anchorPromptTokens: anchor?.promptTokens,
        anchorSource: anchor ? `${anchor.source} + ${source}` : source,
        deltaMessageTokens
    }
}

// beforeModel sees the checkpointed system prompt and registered tools. Count them again
// after history replacement, when provider usage anchors no longer describe the messages.
export function estimateFixedInputTokens(
    state: unknown,
    messages: BaseMessage[],
    tools?: IAgentMiddlewareContext['tools']
): number {
    const system = typeof state === 'object' && state !== null && 'system' in state ? state.system : undefined
    const systemTokens = system && !messages.some(isSystemMessage) ? estimateTokenCountSync(JSON.stringify(system)) : 0
    const schemas = tools?.size ? [...tools.values()].map((tool) => convertToOpenAITool(tool)) : []
    return systemTokens + (schemas.length ? estimateTokenCountSync(JSON.stringify(schemas)) : 0)
}

export function fitsPromptBudget(estimate: PromptWindowEstimate, tokenLimit: number): boolean {
    return (
        estimate.estimatedPromptTokens <= estimate.effectivePromptBudget && estimate.projectedTotalTokens <= tokenLimit
    )
}

export function limitSummaryModelOutput(model: TAgentRunnableConfigurable['copilotModel'], budget: number) {
    const options = { ...model.options, max_tokens: Math.floor(budget) }
    for (const key of [
        'max_output_tokens',
        'max_completion_tokens',
        'maxTokens',
        'max_tokens_to_sample',
        'num_predict'
    ]) {
        if (key in options) options[key] = Math.floor(budget)
    }
    return { ...model, options }
}
