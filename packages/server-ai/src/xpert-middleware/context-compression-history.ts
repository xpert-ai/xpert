import {
    BaseMessage,
    AIMessage,
    ToolMessage,
    isAIMessage,
    isHumanMessage,
    isToolMessage
} from '@langchain/core/messages'
import { Logger } from '@nestjs/common'
import { AgentMiddlewareRuntimeApi, WorkspaceFilesRuntimeCapability } from '@xpert-ai/plugin-sdk'
import { v4 as uuid } from 'uuid'
import { estimateContextText, estimateContextContent, fitContextText, truncateContextText } from './context-budget'

/**
 * Compression trigger threshold: triggers compression when token count exceeds 70% of model limit
 * Higher threshold to reduce unnecessary compression
 */
export const DEFAULT_COMPRESSION_TOKEN_THRESHOLD = 0.7

/**
 * Preserve the last 30% of conversation history
 */
export const COMPRESSION_PRESERVE_THRESHOLD = 0.3

/**
 * Token budget for tool outputs: 50,000 tokens
 */
export const COMPRESSION_TOOL_RESPONSE_TOKEN_BUDGET = 50_000

/**
 * Number of lines to keep when truncating tool output
 */
export const COMPRESSION_TRUNCATE_LINES = 30

/**
 * Prune minimum threshold: only prune when pruned tokens exceed this value
 * Reference: OpenCode PRUNE_MINIMUM = 20,000
 */
export const PRUNE_MINIMUM_TOKENS = 20_000

/**
 * Prune protection threshold: start marking old tool outputs after accumulating beyond this value
 * Reference: OpenCode PRUNE_PROTECT = 40,000
 */
export const PRUNE_PROTECT_TOKENS = 40_000

/**
 * Number of recent user turns to protect
 * Reference: OpenCode protects the last 2 user turns
 */
export const PROTECTED_USER_TURNS = 2

/**
 * List of protected tools (outputs from these tools will not be pruned)
 */
export const PROTECTED_TOOLS = ['skill', 'task']

function hasToolCalls(message: BaseMessage): boolean {
    if (!isAIMessage(message)) {
        return false
    }
    return message.tool_calls && message.tool_calls.length > 0
}

/**
 * Check if tool is protected (should not be pruned)
 */
function isProtectedTool(toolName: string | undefined): boolean {
    if (!toolName) return false
    return PROTECTED_TOOLS.some((pt) => toolName.toLowerCase().includes(pt.toLowerCase()))
}

export function messageContentToText(content: BaseMessage['content']): string {
    if (typeof content === 'string') {
        return content
    }

    if (Array.isArray(content)) {
        return content
            .flatMap((part) => {
                if (typeof part === 'string') {
                    return [part]
                }
                if (part && typeof part === 'object' && 'text' in part && typeof part.text === 'string') {
                    return [part.text]
                }
                return []
            })
            .join('\n')
    }

    return ''
}

/**
 * Count user turns (from end to beginning)
 * Returns the index of each user message
 */
function getUserTurnIndices(messages: BaseMessage[]): number[] {
    const indices: number[] = []
    for (let i = messages.length - 1; i >= 0; i--) {
        if (isHumanMessage(messages[i])) {
            indices.push(i)
        }
    }
    return indices
}

/**
 * Find compression split point: returns the index of the oldest message to preserve
 * Improvement: ensures protection of the last N user turns
 */
export function findCompressSplitPoint(
    messages: BaseMessage[],
    fraction: number,
    protectedTurns: number = PROTECTED_USER_TURNS
): { splitPoint: number; softenedProtection: boolean } {
    if (fraction <= 0 || fraction >= 1) {
        throw new Error('Fraction must be between 0 and 1')
    }

    const charCounts = messages.map((message) => JSON.stringify(message).length)
    const totalCharCount = charCounts.reduce((a, b) => a + b, 0)
    const targetCharCount = totalCharCount * fraction

    // Get user turn indices
    const userTurnIndices = getUserTurnIndices(messages)

    // Calculate minimum protected index (protect the last N user turns)
    let minProtectedIndex = 0
    const latestUserTurnIndex = userTurnIndices[0] ?? 0
    if (userTurnIndices.length > protectedTurns && protectedTurns > 0) {
        // Index of the Nth user turn (counting from the end)
        minProtectedIndex = userTurnIndices[protectedTurns - 1]
    } else if (userTurnIndices.length > 0) {
        // If there are fewer user turns than required, protect all
        minProtectedIndex = userTurnIndices[userTurnIndices.length - 1]
    }

    let lastSplitPoint = 0
    let cumulativeCharCount = 0

    for (let i = 0; i < messages.length; i++) {
        const message = messages[i]

        // Only split at user messages (not at tool responses)
        if (isHumanMessage(message)) {
            // Ensure we don't split into the protected region
            if (i >= minProtectedIndex) {
                if (cumulativeCharCount >= targetCharCount || latestUserTurnIndex <= i) {
                    // Old context reached the compression target, so keep the configured protected turns.
                    return { splitPoint: Math.max(lastSplitPoint, i), softenedProtection: false }
                }

                // The protected region itself exceeds the compression target. Soften protection by
                // summarizing older protected turns while still keeping the latest user turn intact.
                return { splitPoint: latestUserTurnIndex, softenedProtection: true }
            }

            if (cumulativeCharCount >= targetCharCount) {
                return { splitPoint: i, softenedProtection: false }
            }
            lastSplitPoint = i
        }

        cumulativeCharCount += charCounts[i]
    }

    // Check if all content can be compressed
    const lastMessage = messages[messages.length - 1]
    if (isAIMessage(lastMessage) && !hasToolCalls(lastMessage)) {
        return {
            splitPoint: Math.min(messages.length, minProtectedIndex > 0 ? minProtectedIndex : messages.length),
            softenedProtection: false
        }
    }

    return { splitPoint: lastSplitPoint, softenedProtection: false }
}

function formatPrunedToolOutput(toolName: string): string {
    return `[Old tool output cleared. Tool: ${toolName}]`
}

function truncateToFitBudget(
    content: string,
    budget: number,
    toolName: string,
    outputFile?: string,
    lines?: number
): string {
    const header = outputFile
        ? `[Tool output truncated. Full output: ${outputFile}]\n`
        : `[Tool output truncated: ${toolName}]\n`
    if (estimateContextText(header) >= budget) return fitContextText('[truncated]', budget)
    const tail = lines ? content.split('\n').slice(-lines).join('\n') : content
    return header + fitContextText(tail, budget - estimateContextText(header), true)
}

export class ContextCompressionHistory {
    private readonly logger = new Logger(ContextCompressionHistory.name)
    async pruneOldToolOutputs(
        messages: BaseMessage[],
        options: {
            pruneProtectTokens: number
            pruneMinimumTokens: number
            protectedUserTurns: number
        }
    ): Promise<{ messages: BaseMessage[]; prunedTokens: number }> {
        const { pruneProtectTokens, pruneMinimumTokens, protectedUserTurns } = options

        // Get user turn indices
        const userTurnIndices = getUserTurnIndices(messages)

        // Calculate protection boundary (protect all messages after the last N user turns)
        let protectedBoundary = messages.length
        if (userTurnIndices.length >= protectedUserTurns && protectedUserTurns > 0) {
            protectedBoundary = userTurnIndices[protectedUserTurns - 1]
        }

        // Accumulate tool output tokens from end to beginning
        let accumulatedToolTokens = 0
        let prunedTokens = 0
        const messagesToPrune: Map<number, { originalTokens: number; toolName: string }> = new Map()

        // Reverse iterate, accumulate tool output tokens
        for (let i = messages.length - 1; i >= 0; i--) {
            const message = messages[i]

            if (isToolMessage(message)) {
                const toolName = message.name || 'unknown'

                // Skip protected tools
                if (isProtectedTool(toolName)) {
                    continue
                }

                const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content)
                const tokens = estimateContextText(content)

                // If within protected region, only accumulate without pruning
                if (i >= protectedBoundary) {
                    accumulatedToolTokens += tokens
                    continue
                }

                // After accumulating beyond protection threshold, mark old tool outputs
                if (accumulatedToolTokens >= pruneProtectTokens) {
                    // Check if already pruned
                    const isPruned = message.additional_kwargs?.['pruned'] === true
                    if (!isPruned && tokens > 100) {
                        // Only prune larger outputs
                        messagesToPrune.set(i, { originalTokens: tokens, toolName })
                        prunedTokens += tokens
                    }
                } else {
                    accumulatedToolTokens += tokens
                }
            }
        }

        // If pruned tokens don't meet minimum threshold, skip pruning
        if (prunedTokens < pruneMinimumTokens) {
            this.logger.debug(
                `Pruned tokens (${prunedTokens}) below minimum threshold (${pruneMinimumTokens}), skipping pruning`
            )
            return { messages, prunedTokens: 0 }
        }

        // Execute pruning: create new message list
        const prunedMessages = messages.map((message, index) => {
            const pruneInfo = messagesToPrune.get(index)
            if (pruneInfo && isToolMessage(message)) {
                // Create pruned message
                return new ToolMessage({
                    content: formatPrunedToolOutput(pruneInfo.toolName),
                    tool_call_id: message.tool_call_id,
                    name: message.name,
                    additional_kwargs: {
                        ...message.additional_kwargs,
                        pruned: true,
                        prunedAt: Date.now(),
                        originalTokens: pruneInfo.originalTokens
                    }
                })
            }
            return message
        })

        this.logger.log(
            `First layer pruning complete: pruned ${messagesToPrune.size} tool outputs, saved ${prunedTokens} tokens`
        )

        return { messages: prunedMessages, prunedTokens }
    }

    // ============================================================================
    // Second Layer: Truncation and Summary (Compaction)
    // ============================================================================

    /**
     * Truncate tool outputs using reverse token budget
     * This is part of second layer compression, used to further reduce tokens before generating summary
     */
    async truncateHistoryToBudget(
        messages: BaseMessage[],
        budget: number,
        runtime: AgentMiddlewareRuntimeApi,
        lines?: number
    ): Promise<BaseMessage[]> {
        const files = runtime.capabilities?.get(WorkspaceFilesRuntimeCapability)
        let remaining = Math.max(0, Math.floor(budget))
        let changed = false
        const result = [...messages]
        for (let index = messages.length - 1; index >= 0; index--) {
            const message = messages[index]
            if (!isToolMessage(message)) continue
            const tokens = estimateContextContent(message.content)
            if (tokens <= remaining) {
                remaining -= tokens
                continue
            }
            const preview = truncateContextText(message.content, remaining, (text, budget) =>
                truncateToFitBudget(text, budget, message.name ?? 'tool', undefined, lines)
            )
            if (preview === message.content) {
                remaining = Math.max(0, remaining - tokens)
                continue
            }
            const content = typeof message.content === 'string' ? message.content : JSON.stringify(message.content)
            let outputFile: string | undefined
            let reference = message.additional_kwargs?.compressionFile
            if (files && !reference) {
                try {
                    const file = await files.writeRuntimeBuffer({
                        buffer: Buffer.from(content),
                        filePath: `.context-compression/${uuid()}.txt`,
                        mimeType: 'text/plain'
                    })
                    outputFile = file.workspacePath
                    reference = file.reference
                } catch (error) {
                    this.logger.warn(
                        `Could not persist compressed tool output: ${error instanceof Error ? error.message : String(error)}`
                    )
                }
            } else if (
                reference &&
                typeof reference === 'object' &&
                'workspacePath' in reference &&
                typeof reference.workspacePath === 'string'
            ) {
                outputFile = reference.workspacePath
            }
            const truncated = truncateContextText(message.content, remaining, (text, budget) =>
                truncateToFitBudget(text, budget, message.name ?? 'tool', outputFile, lines)
            )
            if (truncated === message.content) {
                remaining = Math.max(0, remaining - tokens)
                continue
            }
            result[index] = new ToolMessage({
                ...message,
                content: truncated,
                additional_kwargs: {
                    ...message.additional_kwargs,
                    truncated: true,
                    ...(reference ? { compressionFile: reference } : {})
                }
            })
            remaining = Math.max(0, remaining - estimateContextContent(truncated))
            changed = true
        }
        return changed ? this.invalidateUsage(result) : messages
    }

    invalidateUsage(messages: BaseMessage[]): BaseMessage[] {
        return messages.map((message) =>
            isAIMessage(message)
                ? new AIMessage({
                      ...message,
                      additional_kwargs: { ...message.additional_kwargs, contextCompressionUsageInvalidated: true }
                  })
                : message
        )
    }
}
