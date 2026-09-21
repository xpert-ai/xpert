import { I18nObject, I18nText } from '@xpert-ai/contracts'
import { z } from 'zod/v3'

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

export const MANUAL_CONTEXT_COMPRESSION_COMMANDS = new Set(['compact', 'compress'])
export const CONTEXT_WINDOW_EXCEEDED_FINISH_REASON = 'model_context_window_exceeded'
export const CONTEXT_WINDOW_RETRY_STATE_KEY = '__contextCompressionContextWindowRetryApplied'
export const COMPRESSION_NO_GAIN_RETRY_STATE_KEY = '__contextCompressionNoGainRetryState'
export const COMPRESSION_FAILURE_RETRY_STATE_KEY = '__contextCompressionFailureRetryState'
export const MANUAL_COMPRESSION_RESULT_STATE_KEY = '__contextCompressionManualCommandResult'
export const COMPRESSION_NO_GAIN_RETRY_MIN_TOKEN_DELTA = 1024
export const MANUAL_COMPRESSION_SUCCESS_MESSAGE = 'Context compressed.'
export const MANUAL_COMPRESSION_SKIPPED_MESSAGE =
    'No old context was available to compress, so compression was skipped.'
export const MANUAL_COMPRESSION_FALLBACK_SNAPSHOT =
    '<state_snapshot><context_status>Earlier non-protected history was intentionally omitted by manual context compression. Re-read authoritative external state and current tool diagnostics before acting. Do not infer current identifiers or tool schemas from omitted history.</context_status></state_snapshot>'
export const COMPRESSION_NO_MESSAGES_MESSAGE = 'No messages available to compress.'
export const COMPRESSION_NO_UNPROTECTED_HISTORY_MESSAGE =
    'No unprotected history available to compress. Recent user turns were preserved.'
export const COMPRESSION_SOFT_PROTECTION_MESSAGE =
    'Protected user turns exceeded the compression budget. Older protected turns were summarized; the latest user turn was preserved.'

export type CompressionDisplayText = I18nText

export const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })

export const CONTEXT_COMPRESSION_TITLE = text('Context compression', '上下文压缩')
export const COMPRESSION_RUNNING_DISPLAY = text('Automatically compressing context', '正在自动压缩上下文')
export const COMPRESSION_COMPLETED_DISPLAY = text('Context automatically compressed', '上下文已自动压缩')
export const COMPRESSION_NO_MESSAGES_DISPLAY = text(COMPRESSION_NO_MESSAGES_MESSAGE, '没有可压缩的消息。')
export const COMPRESSION_NO_UNPROTECTED_HISTORY_DISPLAY = text(
    COMPRESSION_NO_UNPROTECTED_HISTORY_MESSAGE,
    '没有可压缩的旧上下文。最近的用户回合已被保留。'
)
export const COMPRESSION_NO_MODEL_DISPLAY = text(
    'No model is available for context compression.',
    '没有可用于上下文压缩的模型。'
)
export const COMPRESSION_NO_TOKEN_LIMIT_DISPLAY = text(
    'Unable to resolve token limit for context compression.',
    '无法解析上下文压缩的 token 限制。'
)

export const CompressionNoGainRetryStateSchema = z.object({
    currentTokenCount: z.number().nonnegative(),
    newTokenCount: z.number().nonnegative(),
    tokenLimit: z.number().positive(),
    estimatedPromptTokens: z.number().nonnegative(),
    projectedTotalTokens: z.number().nonnegative(),
    effectivePromptBudget: z.number().nonnegative(),
    fixedInputTokens: z.number().nonnegative().default(0),
    retryAfterTokenCount: z.number().nonnegative(),
    retryAfterPromptTokens: z.number().nonnegative()
})

export const CompressionFailureRetryStateSchema = z.object({
    fingerprint: z.string(),
    executionId: z.string().optional(),
    nextRetryAt: z.number()
})

export class ContextSummaryError extends Error {
    constructor(readonly reason: 'summary_invalid' | 'summary_input_budget' | 'summary_output_budget') {
        super(reason)
    }
}

export const ManualCompressionResultSchema = z.object({
    status: z.enum(['compressed', 'skipped']),
    message: z.string()
})

export const ContextCompressionStateSchema = z.object({
    [CONTEXT_WINDOW_RETRY_STATE_KEY]: z.boolean().default(false),
    [COMPRESSION_NO_GAIN_RETRY_STATE_KEY]: CompressionNoGainRetryStateSchema.nullish(),
    [COMPRESSION_FAILURE_RETRY_STATE_KEY]: CompressionFailureRetryStateSchema.nullish(),
    [MANUAL_COMPRESSION_RESULT_STATE_KEY]: ManualCompressionResultSchema.optional()
})

export type CompressionNoGainRetryState = z.infer<typeof CompressionNoGainRetryStateSchema>
export type ManualCompressionResult = z.infer<typeof ManualCompressionResultSchema>

export interface ContextCompressionMiddlewareOptions {
    /**
     * Compression threshold (fraction of model token limit)
     */
    threshold?: number
    /**
     * Fraction of history to preserve
     */
    preserveFraction?: number
    /**
     * Token budget for tool outputs
     */
    toolOutputBudget?: number
    /**
     * Number of lines to keep when truncating
     */
    truncateLines?: number
    /**
     * Whether to enable two-phase compression (prune first, then summarize)
     * Enabled by default
     */
    enableTwoPhaseCompression?: boolean
    /**
     * Prune protection threshold (tokens)
     */
    pruneProtectTokens?: number
    /**
     * Prune minimum threshold (tokens)
     */
    pruneMinimumTokens?: number
    /**
     * Number of user turns to protect
     */
    protectedUserTurns?: number
}

export interface ResolvedContextCompressionOptions {
    threshold: number
    preserveFraction: number
    toolOutputBudget: number
    enableTwoPhase: boolean
    pruneProtectTokens: number
    pruneMinimumTokens: number
    protectedUserTurns: number
}

export interface CompressionExecutionOptions {
    force: boolean
    reason: 'threshold_exceeded' | 'manual' | typeof CONTEXT_WINDOW_EXCEEDED_FINISH_REASON
}

export interface PromptTokenAnchor {
    index: number
    promptTokens: number
    source: string
}

export interface PromptWindowEstimate {
    fixedInputTokens: number
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

export function isStateContainer(value: unknown): value is object {
    return typeof value === 'object' && value !== null
}
