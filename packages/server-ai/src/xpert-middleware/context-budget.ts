// Invariants: count request content, not historical usage metadata. Replacements
// must be remeasured; neither minimum line counts nor references bypass budgets.
import type { TAgentRunnableConfigurable } from '@xpert-ai/contracts'
import { z } from 'zod/v3'
import { BaseMessage, isAIMessage } from '@langchain/core/messages'

const ProviderTokenUsageSchema = z.object({
    total_tokens: z.unknown().optional(),
    prompt_tokens: z.unknown().optional()
})

export function estimateContextText(text: string): number {
    let units = 0
    for (const character of text) {
        units += character.codePointAt(0) > 127 ? 4 : 1
    }
    return Math.ceil(units / 4)
}

export function estimateContextContent(content: BaseMessage['content']): number {
    if (typeof content === 'string') return estimateContextText(content)
    return content.reduce((total, block) => {
        if (typeof block === 'string') return total + estimateContextText(block)
        if (block.type === 'text' && 'text' in block && typeof block.text === 'string') {
            return total + estimateContextText(block.text)
        }
        // Transport bytes (especially base64) are not text tokens. Until a
        // provider counter is available, reserve per media block; never tokenize
        // the encoded payload. Actual unchanged-request usage remains authoritative.
        return total + 4096
    }, 0)
}

export function estimateContextMessages(messages: BaseMessage[]): number {
    return messages.reduce(
        (total, message) =>
            total +
            4 +
            estimateContextContent(message.content) +
            (isAIMessage(message) && message.tool_calls?.length
                ? estimateContextText(JSON.stringify(message.tool_calls))
                : 0),
        0
    )
}

export function fitContextText(text: string, budget: number, fromEnd = false): string {
    if (budget <= 0) return ''
    if (estimateContextText(text) <= budget) return text
    let low = 0
    let high = text.length
    while (low < high) {
        const size = Math.ceil((low + high) / 2)
        const candidate = fromEnd ? text.slice(text.length - size) : text.slice(0, size)
        if (estimateContextText(candidate) <= budget) low = size
        else high = size - 1
    }
    const result = fromEnd ? text.slice(text.length - low) : text.slice(0, low)
    return fromEnd ? result.replace(/^[\uDC00-\uDFFF]/, '') : result.replace(/[\uD800-\uDBFF]$/, '')
}

/** Reduce text only. Media remains a valid content block even above the soft tool budget. */
export function truncateContextText(
    content: BaseMessage['content'],
    budget: number,
    truncate: (text: string, budget: number) => string
): BaseMessage['content'] {
    if (typeof content === 'string') return truncate(content, budget)
    const media = content.filter((block) => typeof block !== 'string' && block.type !== 'text')
    let remaining = Math.max(0, budget - estimateContextContent(media))
    let changed = false
    const result = content.map((block) => {
        if (typeof block !== 'string' && !(block.type === 'text' && typeof block.text === 'string')) return block
        const text = typeof block === 'string' ? block : block.text
        const reduced = estimateContextText(text) <= remaining ? text : truncate(text, remaining)
        remaining = Math.max(0, remaining - estimateContextText(reduced))
        if (reduced === text) return block
        changed = true
        return typeof block === 'string' ? reduced : { ...block, text: reduced }
    })
    return changed ? result : content
}

interface PromptTokenAnchor {
    index: number
    promptTokens: number
    source: string
}

interface PromptWindowEstimate {
    estimatedPromptTokens: number
    reservedOutputTokens: number
    availablePromptTokens: number
    thresholdPromptTokens: number
    effectivePromptBudget: number
    projectedTotalTokens: number
    anchorPromptTokens?: number
    anchorSource?: string
    deltaMessageTokens: number
}

export class ContextCompressionBudget {
    private async estimateTokens(messages: BaseMessage[]): Promise<number> {
        return estimateContextMessages(messages)
    }

    private toPositiveTokenCount(value: unknown): number | null {
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

    private extractPromptTokenAnchor(message: BaseMessage): PromptTokenAnchor | null {
        if (!isAIMessage(message)) {
            return null
        }

        const responseMetadata = message.response_metadata
        const responseUsage = responseMetadata?.['usage']
        const usageTotalTokens = this.toPositiveTokenCount(responseUsage?.['total_tokens'])
        if (usageTotalTokens !== null) {
            return {
                index: -1,
                promptTokens: usageTotalTokens,
                source: 'response_metadata.usage.total_tokens'
            }
        }

        const usagePromptTokens = this.toPositiveTokenCount(responseUsage?.['prompt_tokens'])
        if (usagePromptTokens !== null) {
            return {
                index: -1,
                promptTokens: usagePromptTokens,
                source: 'response_metadata.usage.prompt_tokens'
            }
        }

        const tokenUsage = responseMetadata?.['tokenUsage']
        const tokenUsageTotalTokens = this.toPositiveTokenCount(tokenUsage?.['totalTokens'])
        if (tokenUsageTotalTokens !== null) {
            return {
                index: -1,
                promptTokens: tokenUsageTotalTokens,
                source: 'response_metadata.tokenUsage.totalTokens'
            }
        }

        const tokenUsagePromptTokens = this.toPositiveTokenCount(tokenUsage?.['promptTokens'])
        if (tokenUsagePromptTokens !== null) {
            return {
                index: -1,
                promptTokens: tokenUsagePromptTokens,
                source: 'response_metadata.tokenUsage.promptTokens'
            }
        }

        const usageMetadata = message.usage_metadata
        const totalTokens = this.toPositiveTokenCount(usageMetadata?.['total_tokens'])
        if (totalTokens !== null) {
            return {
                index: -1,
                promptTokens: totalTokens,
                source: 'usage_metadata.total_tokens'
            }
        }

        const inputTokens = this.toPositiveTokenCount(usageMetadata?.['input_tokens'])
        if (inputTokens !== null) {
            return {
                index: -1,
                promptTokens: inputTokens,
                source: 'usage_metadata.input_tokens'
            }
        }

        const rawResponse = message.additional_kwargs?.['__raw_response']
        const rawUsageResult = ProviderTokenUsageSchema.safeParse(
            rawResponse && typeof rawResponse === 'object' && 'usage' in rawResponse ? rawResponse.usage : undefined
        )
        const rawUsage = rawUsageResult.success ? rawUsageResult.data : undefined
        const rawTotalTokens = this.toPositiveTokenCount(rawUsage?.total_tokens)
        if (rawTotalTokens !== null) {
            return {
                index: -1,
                promptTokens: rawTotalTokens,
                source: 'additional_kwargs.__raw_response.usage.total_tokens'
            }
        }

        const rawPromptTokens = this.toPositiveTokenCount(rawUsage?.prompt_tokens)
        if (rawPromptTokens !== null) {
            return {
                index: -1,
                promptTokens: rawPromptTokens,
                source: 'additional_kwargs.__raw_response.usage.prompt_tokens'
            }
        }

        return null
    }

    private findLatestPromptTokenAnchor(messages: BaseMessage[]): PromptTokenAnchor | null {
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].additional_kwargs?.contextCompressionUsageInvalidated === true) continue
            const anchor = this.extractPromptTokenAnchor(messages[i])
            if (anchor) {
                return {
                    ...anchor,
                    index: i
                }
            }
        }

        return null
    }

    private resolveReservedOutputTokens(
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
            const resolved = this.toPositiveTokenCount(value)
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

    async estimatePromptWindowUsage(
        messages: BaseMessage[],
        model: TAgentRunnableConfigurable['copilotModel'],
        tokenLimit: number,
        threshold: number,
        fixedTokens = 0
    ): Promise<PromptWindowEstimate> {
        const messageOnlyTokens = await this.estimateTokens(messages)
        const anchor = this.findLatestPromptTokenAnchor(messages)

        let deltaMessageTokens = messageOnlyTokens
        let estimatedPromptTokens = messageOnlyTokens + fixedTokens

        if (anchor) {
            const subsequentMessages = messages.slice(anchor.index + 1)
            deltaMessageTokens = subsequentMessages.length ? await this.estimateTokens(subsequentMessages) : 0
            estimatedPromptTokens = Math.max(messageOnlyTokens + fixedTokens, anchor.promptTokens + deltaMessageTokens)
        }

        const { reservedOutputTokens, source } = this.resolveReservedOutputTokens(model, tokenLimit, threshold)
        const availablePromptTokens = Math.max(0, tokenLimit - reservedOutputTokens)
        const thresholdPromptTokens = Math.max(0, Math.round(tokenLimit * Math.max(0, Math.min(1, threshold))))
        const effectivePromptBudget = Math.min(availablePromptTokens, thresholdPromptTokens || availablePromptTokens)

        return {
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
}
