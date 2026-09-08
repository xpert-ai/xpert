// Invariants: history reductions must be returned through the Agent channel.
// Recount replacements, bound summary work, and validate the complete request
// immediately before invocation; a smaller history alone does not prove it fits.
// Summary model events stay internal; only the state snapshot becomes memory.
// Automatic compression runs only in wrapModelCall with the complete request budget.
import {
    CONTEXT_COMPRESSION_META,
    ContextCompressionMiddlewareOptions,
    ResolvedContextCompressionOptions
} from './context-compression.config'
export type { ContextCompressionMiddlewareOptions } from './context-compression.config'
import {
    ContextCompressionHistory,
    messageContentToText,
    findCompressSplitPoint,
    DEFAULT_COMPRESSION_TOKEN_THRESHOLD,
    COMPRESSION_PRESERVE_THRESHOLD,
    COMPRESSION_TOOL_RESPONSE_TOKEN_BUDGET,
    COMPRESSION_TRUNCATE_LINES,
    PRUNE_MINIMUM_TOKENS,
    PRUNE_PROTECT_TOKENS,
    PROTECTED_USER_TURNS,
    PROTECTED_TOOLS
} from './context-compression-history'
export {
    DEFAULT_COMPRESSION_TOKEN_THRESHOLD,
    COMPRESSION_PRESERVE_THRESHOLD,
    COMPRESSION_TOOL_RESPONSE_TOKEN_BUDGET,
    COMPRESSION_TRUNCATE_LINES,
    PRUNE_MINIMUM_TOKENS,
    PRUNE_PROTECT_TOKENS,
    PROTECTED_USER_TURNS,
    PROTECTED_TOOLS
} from './context-compression-history'
import { ContextCompressionBudget } from './context-budget'
import {
    generateStateSnapshot,
    ContextSummaryError,
    retainsRequiredContext,
    summaryFailureMessage
} from './context-compression-summary'
import { preserveModelRequestState } from '../shared/agent/model-request-state'
import { Injectable, Logger } from '@nestjs/common'
import {
    BaseMessage,
    AIMessage,
    HumanMessage,
    RemoveMessage,
    isAIMessage,
    isHumanMessage
} from '@langchain/core/messages'
import {
    AgentMiddleware,
    AgentMiddlewareStrategy,
    type AgentMiddlewareRuntimeApi,
    IAgentMiddlewareContext,
    IAgentMiddlewareStrategy,
    PromiseOrValue,
    getModelContextSize
} from '@xpert-ai/plugin-sdk'
import { isGraphInterrupt, REMOVE_ALL_MESSAGES } from '@langchain/langgraph'
import {
    channelName,
    ChatMessageTypeEnum,
    CONTEXT_COMPRESSION_COMPONENT_TYPE,
    CONTEXT_COMPRESSION_MIDDLEWARE_NAME,
    I18nObject,
    I18nText,
    TContextCompressionComponentData,
    TContextCompressionComponentReason,
    TContextCompressionComponentStatus,
    TAgentRunnableConfigurable,
    TMessageContentComponent
} from '@xpert-ai/contracts'
import { v4 as uuid } from 'uuid'
import { BaseLanguageModel } from '@langchain/core/language_models/base'
import { createHash } from 'node:crypto'
import { t } from 'i18next'
import { convertToOpenAITool } from '@langchain/core/utils/function_calling'
import { estimateContextText, estimateContextMessages } from './context-budget'
import { z } from 'zod/v3'

// ============================================================================
// Constants
// ============================================================================

const MANUAL_CONTEXT_COMPRESSION_COMMANDS = new Set(['compact', 'compress'])
const CONTEXT_WINDOW_EXCEEDED_FINISH_REASON = 'model_context_window_exceeded'
const CONTEXT_WINDOW_RETRY_STATE_KEY = '__contextCompressionContextWindowRetryApplied'
const CONTEXT_WINDOW_RETRY_PENDING_KEY = '__contextCompressionContextWindowRetryPending'
const COMPRESSION_NO_GAIN_RETRY_STATE_KEY = '__contextCompressionNoGainRetryState'
const MANUAL_COMPRESSION_RESULT_STATE_KEY = '__contextCompressionManualCommandResult'
const COMPRESSION_NO_GAIN_RETRY_MIN_TOKEN_DELTA = 1024
const COMPRESSION_MINIMUM_GAIN_FRACTION = 0.2
const MANUAL_COMPRESSION_SUCCESS_MESSAGE = 'Context compressed.'
const MANUAL_COMPRESSION_SKIPPED_MESSAGE = 'No old context was available to compress, so compression was skipped.'
const MANUAL_COMPRESSION_FALLBACK_SNAPSHOT =
    '<state_snapshot><context_status>Earlier non-protected history was intentionally omitted by manual context compression. Re-read authoritative external state and current tool diagnostics before acting. Do not infer current identifiers or tool schemas from omitted history.</context_status></state_snapshot>'
const COMPRESSION_NO_MESSAGES_MESSAGE = 'No messages available to compress.'
const COMPRESSION_NO_UNPROTECTED_HISTORY_MESSAGE =
    'No unprotected history available to compress. Recent user turns were preserved.'
const COMPRESSION_SOFT_PROTECTION_MESSAGE =
    'Protected user turns exceeded the compression budget. Older protected turns were summarized; the latest user turn was preserved.'

type CompressionDisplayText = I18nText

const text = (en_US: string, zh_Hans: string): I18nObject => ({ en_US, zh_Hans })

const CONTEXT_COMPRESSION_TITLE = text('Context compression', '上下文压缩')
const COMPRESSION_RUNNING_DISPLAY = text('Automatically compressing context', '正在自动压缩上下文')
const COMPRESSION_COMPLETED_DISPLAY = text('Context automatically compressed', '上下文已自动压缩')
const COMPRESSION_NO_MESSAGES_DISPLAY = text(COMPRESSION_NO_MESSAGES_MESSAGE, '没有可压缩的消息。')
const COMPRESSION_NO_UNPROTECTED_HISTORY_DISPLAY = text(
    COMPRESSION_NO_UNPROTECTED_HISTORY_MESSAGE,
    '没有可压缩的旧上下文。最近的用户回合已被保留。'
)
const COMPRESSION_NO_MODEL_DISPLAY = text(
    'No model is available for context compression.',
    '没有可用于上下文压缩的模型。'
)
const COMPRESSION_NO_TOKEN_LIMIT_DISPLAY = text(
    'Unable to resolve token limit for context compression.',
    '无法解析上下文压缩的 token 限制。'
)

const COMPRESSION_FAILURE_RETRY_STATE_KEY = '__contextCompressionFailureRetryState'
const CompressionFailureRetryStateSchema = z.object({
    candidateKey: z.string(),
    attempts: z.number().int().positive(),
    nextRetryAt: z.number()
})

const CompressionNoGainRetryStateSchema = z.object({
    currentTokenCount: z.number().nonnegative(),
    newTokenCount: z.number().nonnegative(),
    tokenLimit: z.number().positive(),
    estimatedPromptTokens: z.number().nonnegative(),
    projectedTotalTokens: z.number().nonnegative(),
    effectivePromptBudget: z.number().nonnegative(),
    retryAfterTokenCount: z.number().nonnegative(),
    retryAfterPromptTokens: z.number().nonnegative(),
    candidateKey: z.string().optional()
})

const ManualCompressionResultSchema = z.object({
    status: z.enum(['compressed', 'skipped']),
    message: z.string()
})

const ContextCompressionStateSchema = z.object({
    [CONTEXT_WINDOW_RETRY_STATE_KEY]: z.boolean().default(false),
    [CONTEXT_WINDOW_RETRY_PENDING_KEY]: z.boolean().default(false),
    [COMPRESSION_NO_GAIN_RETRY_STATE_KEY]: CompressionNoGainRetryStateSchema.nullish(),
    [COMPRESSION_FAILURE_RETRY_STATE_KEY]: CompressionFailureRetryStateSchema.nullish(),
    [MANUAL_COMPRESSION_RESULT_STATE_KEY]: ManualCompressionResultSchema.optional()
})

type CompressionNoGainRetryState = z.infer<typeof CompressionNoGainRetryStateSchema>
type ManualCompressionResult = z.infer<typeof ManualCompressionResultSchema>

// ============================================================================
// Utility Functions
// ============================================================================

function hasInsufficientCompressionGain(currentTokenCount: number, newTokenCount: number): boolean {
    const minimumGain = Math.min(
        COMPRESSION_NO_GAIN_RETRY_MIN_TOKEN_DELTA,
        Math.max(1, Math.ceil(currentTokenCount * COMPRESSION_MINIMUM_GAIN_FRACTION))
    )
    return currentTokenCount - newTokenCount < minimumGain
}

/**
 * Check if AI message contains tool calls
 */
function readManualContextCompressionCommand(value: unknown): string | null {
    if (typeof value !== 'string') {
        return null
    }

    const match = /^\s*\/([a-z0-9][a-z0-9_-]{0,63})\s*$/i.exec(value)
    if (!match) {
        return null
    }

    const command = match[1].toLowerCase()
    return MANUAL_CONTEXT_COMPRESSION_COMMANDS.has(command) ? command : null
}

function isManualContextCompressionCommand(value: unknown): boolean {
    return Boolean(readManualContextCompressionCommand(value))
}

function hasTrailingManualContextCompressionCommand(messages: BaseMessage[]): boolean {
    const lastMessage = messages[messages.length - 1]
    return Boolean(
        lastMessage &&
        isHumanMessage(lastMessage) &&
        isManualContextCompressionCommand(messageContentToText(lastMessage.content))
    )
}

function getManualCompressionHistory(messages: BaseMessage[]): BaseMessage[] {
    return hasTrailingManualContextCompressionCommand(messages) ? messages.slice(0, -1) : messages
}

interface CompressionExecutionOptions {
    force: boolean
    reason: 'threshold_exceeded' | 'manual' | typeof CONTEXT_WINDOW_EXCEEDED_FINISH_REASON
    fixedTokens?: number
    tokenLimit?: number
}

interface CompressionControl {
    noGain: CompressionNoGainRetryState | null
    failure: z.infer<typeof CompressionFailureRetryStateSchema> | null
}

function isStateContainer(value: unknown): value is object {
    return typeof value === 'object' && value !== null
}

@Injectable()
@AgentMiddlewareStrategy(CONTEXT_COMPRESSION_MIDDLEWARE_NAME)
export class ContextCompressionMiddleware implements IAgentMiddlewareStrategy {
    readonly meta = CONTEXT_COMPRESSION_META

    readonly stateSchema = ContextCompressionStateSchema

    private readonly logger = new Logger(ContextCompressionMiddleware.name)
    private readonly history = new ContextCompressionHistory()
    private readonly budget = new ContextCompressionBudget()

    private isManualCompressionRequest(
        state: { messages?: BaseMessage[] },
        runtime: { state?: { human?: { input?: unknown } } }
    ): boolean {
        return (
            isManualContextCompressionCommand(runtime?.state?.human?.input) ||
            hasTrailingManualContextCompressionCommand(state.messages ?? [])
        )
    }

    private createManualCompressionResult(compressed: boolean): ManualCompressionResult {
        return compressed
            ? {
                  status: 'compressed',
                  message: MANUAL_COMPRESSION_SUCCESS_MESSAGE
              }
            : {
                  status: 'skipped',
                  message: MANUAL_COMPRESSION_SKIPPED_MESSAGE
              }
    }

    private readManualCompressionResult(stateContainer: unknown): ManualCompressionResult | null {
        if (!isStateContainer(stateContainer)) {
            return null
        }

        const parsed = ManualCompressionResultSchema.safeParse(
            Reflect.get(stateContainer, MANUAL_COMPRESSION_RESULT_STATE_KEY)
        )
        return parsed.success ? parsed.data : null
    }

    private readManualCompressionResultFromRequestState(
        stateContainer: unknown,
        agentKey?: string
    ): ManualCompressionResult | null {
        const result = this.readManualCompressionResult(stateContainer)
        if (result || !agentKey || !isStateContainer(stateContainer)) {
            return result
        }

        return this.readManualCompressionResult(Reflect.get(stateContainer, channelName(agentKey)))
    }

    private emitCompressionUnavailable(
        runtime: { configurable?: Partial<TAgentRunnableConfigurable> },
        message: CompressionDisplayText,
        error?: string
    ): void {
        this.emitCompressionChunk(runtime, {
            id: uuid(),
            status: 'fail',
            message,
            error: error ?? (typeof message === 'string' ? message : message.en_US)
        })
    }

    private emitCompressionSkipped(
        runtime: { configurable?: Partial<TAgentRunnableConfigurable> },
        message: CompressionDisplayText,
        reason: TContextCompressionComponentReason
    ): void {
        this.emitCompressionChunk(runtime, {
            id: uuid(),
            status: 'success',
            message,
            reason
        })
    }

    private readNoGainRetryState(stateContainer: unknown): CompressionNoGainRetryState | null {
        if (!isStateContainer(stateContainer)) {
            return null
        }

        const parsed = CompressionNoGainRetryStateSchema.safeParse(
            Reflect.get(stateContainer, COMPRESSION_NO_GAIN_RETRY_STATE_KEY)
        )

        return parsed.success ? parsed.data : null
    }

    private readFailureRetryState(state: unknown): CompressionControl['failure'] {
        if (!isStateContainer(state)) return null
        const parsed = CompressionFailureRetryStateSchema.safeParse(
            Reflect.get(state, COMPRESSION_FAILURE_RETRY_STATE_KEY)
        )
        return parsed.success ? parsed.data : null
    }

    private async resolveCompressionTokenLimit(
        model: TAgentRunnableConfigurable['copilotModel'],
        getCompressionModel: () => Promise<BaseLanguageModel>
    ): Promise<number | null> {
        const configuredLimit = getModelContextSize(model)
        if (configuredLimit && configuredLimit > 0) {
            return configuredLimit
        }

        const resolvedLimit = getModelContextSize(await getCompressionModel())
        if (resolvedLimit && resolvedLimit > 0) {
            return resolvedLimit
        }

        return null
    }

    private emitCompressionChunk(
        runtime: { configurable?: Partial<TAgentRunnableConfigurable> },
        payload: {
            id: string
            status: TContextCompressionComponentStatus
            reason?: TContextCompressionComponentReason
            message?: CompressionDisplayText
            summary?: string
            error?: CompressionDisplayText
        }
    ): void {
        const configurable = runtime?.configurable as TAgentRunnableConfigurable | undefined
        const subscriber = configurable?.subscriber
        if (!subscriber) {
            return
        }

        const now = new Date()

        subscriber.next({
            data: {
                type: ChatMessageTypeEnum.MESSAGE,
                data: {
                    id: payload.id,
                    type: 'component',
                    xpertName: configurable?.xpertName,
                    agentKey: configurable?.agentKey,
                    data: {
                        category: 'Tool',
                        type: CONTEXT_COMPRESSION_COMPONENT_TYPE,
                        title: CONTEXT_COMPRESSION_TITLE,
                        reason: payload.reason,
                        message: payload.message,
                        summary: payload.summary,
                        status: payload.status,
                        created_date: now,
                        end_date: payload.status === 'running' ? null : now,
                        error: payload.error
                    }
                } as TMessageContentComponent<TContextCompressionComponentData>
            }
        } as MessageEvent)
    }

    private budgetError(): string {
        return t('server-ai:Error.ContextCompressionBudgetExceeded', {
            defaultValue:
                'The model input still exceeds its context budget. Reduce the input or tools, or select a larger-context model.'
        })
    }

    /**
     * Build new history
     */
    private buildNewHistory(
        snapshot: string,
        preservedMessages: BaseMessage[],
        compressionId: string,
        originalMessageCount: number,
        originalTokenCount: number
    ): BaseMessage[] {
        return [
            new HumanMessage({
                content: snapshot,
                additional_kwargs: {
                    compressed: true,
                    compressionId,
                    originalMessageCount,
                    originalTokenCount
                }
            }),
            new AIMessage({
                content:
                    'Context snapshot loaded. Continue following the effective user constraints and the latest user request.',
                additional_kwargs: {
                    compressionAck: true,
                    compressionId
                }
            }),
            ...preservedMessages
        ]
    }

    private getFinishReason(message: BaseMessage | undefined): string | undefined {
        if (!message || !isAIMessage(message)) {
            return undefined
        }

        const responseMetadata = message.response_metadata
        const finishReason = responseMetadata?.['finish_reason']
        if (typeof finishReason === 'string') {
            return finishReason
        }

        const rawResponse = message.additional_kwargs?.['__raw_response']
        if (
            rawResponse &&
            typeof rawResponse === 'object' &&
            'choices' in rawResponse &&
            Array.isArray(rawResponse.choices)
        ) {
            const first = rawResponse.choices[0]
            if (
                first &&
                typeof first === 'object' &&
                'finish_reason' in first &&
                typeof first.finish_reason === 'string'
            )
                return first.finish_reason
        }

        return undefined
    }

    private async compressMessages(
        messages: BaseMessage[],
        runtime: { configurable?: Partial<TAgentRunnableConfigurable> },
        middlewareRuntime: AgentMiddlewareRuntimeApi,
        options: ResolvedContextCompressionOptions,
        execution: CompressionExecutionOptions,
        control: CompressionControl
    ): Promise<BaseMessage[] | null> {
        if (!messages.length) {
            if (execution.reason === 'manual')
                this.emitCompressionSkipped(runtime, COMPRESSION_NO_MESSAGES_DISPLAY, 'no_messages')
            return null
        }
        const model = runtime.configurable?.copilotModel
        if (!model) return null
        const tokenLimit =
            execution.tokenLimit ??
            (await this.resolveCompressionTokenLimit(model, () =>
                middlewareRuntime.createModelClient<BaseLanguageModel>(model, {})
            ))
        if (!tokenLimit) {
            if (execution.reason === 'manual')
                this.emitCompressionUnavailable(runtime, COMPRESSION_NO_TOKEN_LIMIT_DISPLAY)
            return null
        }
        const fixed = execution.fixedTokens ?? 0
        const estimate = await this.budget.estimatePromptWindowUsage(
            messages,
            model,
            tokenLimit,
            options.threshold,
            fixed
        )
        const safety = Math.ceil(tokenLimit * 0.05)
        const hardBudget = Math.max(0, estimate.availablePromptTokens - fixed - safety)
        const target = Math.max(0, Math.min(estimate.effectivePromptBudget - fixed, hardBudget))
        if (!execution.force && estimate.estimatedPromptTokens <= target + fixed) {
            return null
        }
        const id = uuid()
        let current = messages
        const originalTokens = estimateContextMessages(messages)
        const toolBudget = Math.max(0, Math.min(options.toolOutputBudget, Math.floor(target * 0.35)))
        if (options.enableTwoPhase) {
            const pruned = await this.history.pruneOldToolOutputs(current, {
                pruneProtectTokens: Math.min(options.pruneProtectTokens, Math.floor(target * 0.2)),
                pruneMinimumTokens: Math.min(options.pruneMinimumTokens, Math.max(1, Math.floor(target * 0.05))),
                protectedUserTurns: options.protectedUserTurns
            })
            if (pruned.messages !== current) current = this.history.invalidateUsage(pruned.messages)
        }
        current = await this.history.truncateHistoryToBudget(
            current,
            toolBudget,
            middlewareRuntime,
            options.truncateLines
        )
        if (!execution.force && current !== messages && estimateContextMessages(current) <= target) {
            control.noGain = null
            control.failure = null
            this.emitCompressionChunk(runtime, { id, status: 'success', message: COMPRESSION_COMPLETED_DISPLAY })
            return current
        }
        const split = findCompressSplitPoint(current, 1 - options.preserveFraction, options.protectedUserTurns)
        const old = current.slice(0, split.splitPoint)
        const kept = current.slice(split.splitPoint)
        if (!old.length) {
            this.emitCompressionChunk(runtime, {
                id,
                status: estimateContextMessages(current) <= hardBudget ? 'success' : 'fail',
                message:
                    estimateContextMessages(current) > hardBudget
                        ? this.budgetError()
                        : current !== messages
                          ? COMPRESSION_COMPLETED_DISPLAY
                          : COMPRESSION_NO_UNPROTECTED_HISTORY_DISPLAY,
                ...(estimateContextMessages(current) > hardBudget
                    ? { reason: 'context_budget_exceeded' as const }
                    : current === messages
                      ? { reason: 'no_unprotected_history' as const }
                      : {})
            })
            return current !== messages ? current : null
        }
        if (execution.reason === 'manual') {
            control.noGain = null
            control.failure = null
            const result = this.history.invalidateUsage(
                this.buildNewHistory(MANUAL_COMPRESSION_FALLBACK_SNAPSHOT, kept, id, old.length, originalTokens)
            )
            this.emitCompressionChunk(runtime, {
                id,
                status: 'success',
                message: COMPRESSION_COMPLETED_DISPLAY,
                summary: MANUAL_COMPRESSION_FALLBACK_SNAPSHOT
            })
            return result
        }
        const candidateKey = createHash('sha256')
            .update(
                JSON.stringify({
                    version: 'validated-summary-v3',
                    messages: old.map((message) => ({
                        type: message._getType(),
                        content: message.content,
                        calls: isAIMessage(message) ? message.tool_calls : undefined
                    })),
                    model: model.model,
                    copilotId: model.copilotId,
                    tokenLimit,
                    options: model.options,
                    threshold: options.threshold,
                    summaryBudget: Math.max(128, Math.min(4096, Math.floor(target * 0.15))),
                    recentUsers: kept.filter(isHumanMessage).map((message) => message.content)
                })
            )
            .digest('hex')
        if (control.noGain?.candidateKey === candidateKey && !execution.force) {
            this.emitCompressionChunk(runtime, {
                id,
                status: 'fail',
                reason: 'no_token_gain',
                message: t('server-ai:Error.ContextCompressionNoGain', {
                    defaultValue: 'Context compression failed to achieve meaningful reduction.'
                })
            })
            return current !== messages ? current : null
        }
        if (
            !execution.force &&
            control.failure?.candidateKey === candidateKey &&
            Date.now() < control.failure.nextRetryAt
        ) {
            this.emitCompressionChunk(runtime, {
                id,
                status: 'fail',
                reason: 'retry_deferred',
                message: t('server-ai:Error.ContextCompressionRetryDeferred', {
                    defaultValue: 'The previous summary attempt failed. Retry after a short delay.'
                })
            })
            return current !== messages ? current : null
        }
        let result = current
        let snapshot: string | undefined
        this.emitCompressionChunk(runtime, { id, status: 'running', message: COMPRESSION_RUNNING_DISPLAY })
        try {
            const summaryBudget = Math.max(128, Math.min(4096, Math.floor(target * 0.15)))
            const summaryModel = await middlewareRuntime.createModelClient<BaseLanguageModel>(
                {
                    ...model,
                    options: Object.fromEntries([
                        ...Object.entries(model.options ?? {}).map(([key, value]) => [
                            key,
                            [
                                'max_output_tokens',
                                'max_completion_tokens',
                                'maxTokens',
                                'max_tokens_to_sample',
                                'num_predict'
                            ].includes(key)
                                ? summaryBudget
                                : value
                        ]),
                        ['max_tokens', summaryBudget]
                    ])
                },
                {}
            )
            snapshot = await generateStateSnapshot(old, kept, summaryModel, tokenLimit, summaryBudget)
            const summarized = this.history.invalidateUsage(
                this.buildNewHistory(snapshot, kept, id, old.length, originalTokens)
            )
            if (!hasInsufficientCompressionGain(estimateContextMessages(current), estimateContextMessages(summarized)))
                result = summarized
        } catch (error) {
            if (isGraphInterrupt(error) || (error instanceof Error && error.name === 'AbortError')) throw error
            this.logger.warn(`Context summary failed: ${error instanceof Error ? error.message : String(error)}`)
            const previous = control.failure?.candidateKey === candidateKey ? control.failure.attempts : 0
            const attempts = previous >= 3 ? 1 : previous + 1
            control.noGain = null
            control.failure = {
                candidateKey,
                attempts,
                nextRetryAt: Date.now() + (attempts >= 3 ? 60000 : 1000 * 2 ** (attempts - 1))
            }
            const reason = error instanceof ContextSummaryError ? error.reason : 'summary_service_error'
            const message = summaryFailureMessage(reason)
            this.emitCompressionChunk(runtime, { id, status: 'fail', reason, message, error: message })
            return current !== messages ? current : null
        }
        if (result === current) {
            control.failure = null
            control.noGain = {
                currentTokenCount: originalTokens,
                newTokenCount: estimateContextMessages(result),
                tokenLimit,
                estimatedPromptTokens: estimate.estimatedPromptTokens,
                projectedTotalTokens: estimate.projectedTotalTokens,
                effectivePromptBudget: target,
                retryAfterTokenCount: originalTokens + 1024,
                retryAfterPromptTokens: estimate.estimatedPromptTokens + 1024,
                candidateKey
            }
            const error = t('server-ai:Error.ContextCompressionNoGain', {
                defaultValue: 'Context compression failed to achieve meaningful reduction.'
            })
            this.emitCompressionChunk(runtime, { id, status: 'fail', reason: 'no_token_gain', message: error, error })
        } else {
            control.noGain = null
            control.failure = null
            const withinBudget = estimateContextMessages(result) <= hardBudget
            this.emitCompressionChunk(runtime, {
                id,
                status: withinBudget ? 'success' : 'fail',
                ...(withinBudget ? {} : { reason: 'context_budget_exceeded' as const }),
                message: withinBudget ? COMPRESSION_COMPLETED_DISPLAY : this.budgetError(),
                summary: snapshot
            })
        }
        return result !== messages ? result : null
    }

    createMiddleware(
        options: ContextCompressionMiddlewareOptions,
        context: IAgentMiddlewareContext
    ): PromiseOrValue<AgentMiddleware> {
        const middlewareRuntime = context.runtime
        const resolvedOptions: ResolvedContextCompressionOptions = {
            threshold: options?.threshold ?? DEFAULT_COMPRESSION_TOKEN_THRESHOLD,
            preserveFraction: options?.preserveFraction ?? COMPRESSION_PRESERVE_THRESHOLD,
            toolOutputBudget: options?.toolOutputBudget ?? COMPRESSION_TOOL_RESPONSE_TOKEN_BUDGET,
            enableTwoPhase: options?.enableTwoPhaseCompression ?? true,
            pruneProtectTokens: options?.pruneProtectTokens ?? PRUNE_PROTECT_TOKENS,
            pruneMinimumTokens: options?.pruneMinimumTokens ?? PRUNE_MINIMUM_TOKENS,
            protectedUserTurns: options?.protectedUserTurns ?? PROTECTED_USER_TURNS,
            truncateLines: options?.truncateLines
        }

        return {
            name: CONTEXT_COMPRESSION_MIDDLEWARE_NAME,
            stateSchema: this.stateSchema,
            tools: [],
            beforeModel: async (state, runtime) => {
                const messages = state.messages ?? []
                const control: CompressionControl = {
                    noGain: this.readNoGainRetryState(state),
                    failure: this.readFailureRetryState(state)
                }

                if (this.isManualCompressionRequest(state, runtime as { state?: { human?: { input?: unknown } } })) {
                    const messagesToCompress = getManualCompressionHistory(messages)
                    const compressedMessages = await this.compressMessages(
                        messagesToCompress,
                        runtime,
                        middlewareRuntime,
                        resolvedOptions,
                        {
                            force: true,
                            reason: 'manual'
                        },
                        control
                    )
                    const result = this.createManualCompressionResult(Boolean(compressedMessages))

                    return {
                        ...(compressedMessages
                            ? {
                                  messages: [new RemoveMessage({ id: REMOVE_ALL_MESSAGES }), ...compressedMessages]
                              }
                            : {}),
                        [COMPRESSION_NO_GAIN_RETRY_STATE_KEY]: control.noGain,
                        [COMPRESSION_FAILURE_RETRY_STATE_KEY]: control.failure,
                        [CONTEXT_WINDOW_RETRY_STATE_KEY]: false,
                        [CONTEXT_WINDOW_RETRY_PENDING_KEY]: false,
                        [MANUAL_COMPRESSION_RESULT_STATE_KEY]: result
                    }
                }
            },
            wrapModelCall: async (request, handler) => {
                const requestState = request.state
                const requestHuman =
                    requestState && typeof requestState === 'object' && 'human' in requestState
                        ? requestState.human
                        : undefined
                const requestInput =
                    requestHuman && typeof requestHuman === 'object' && 'input' in requestHuman
                        ? requestHuman.input
                        : undefined
                if (
                    !isManualContextCompressionCommand(requestInput) &&
                    !hasTrailingManualContextCompressionCommand(request.messages ?? [])
                ) {
                    const model = request.runtime.configurable?.copilotModel
                    if (!model) return handler(request)
                    const limit = await this.resolveCompressionTokenLimit(model, () =>
                        middlewareRuntime.createModelClient<BaseLanguageModel>(model, {})
                    )
                    if (!limit) return handler(request)
                    const toolSchemas = request.tools.map((tool) =>
                        'schema' in tool ? convertToOpenAITool(tool) : tool
                    )
                    const fixedTokens =
                        (request.systemMessage ? estimateContextMessages([request.systemMessage]) : 0) +
                        estimateContextText(JSON.stringify(toolSchemas))
                    const channel = context.agentKey && request.state[channelName(context.agentKey)]
                    const retryPending =
                        isStateContainer(channel) && Reflect.get(channel, CONTEXT_WINDOW_RETRY_PENDING_KEY) === true
                    const control: CompressionControl = {
                        noGain: this.readNoGainRetryState(channel),
                        failure: this.readFailureRetryState(channel)
                    }
                    const compressionRuntime = {
                        configurable: { copilotModel: model, subscriber: request.runtime.configurable?.subscriber }
                    }
                    const compressed = await this.compressMessages(
                        request.messages,
                        compressionRuntime,
                        middlewareRuntime,
                        resolvedOptions,
                        {
                            force: retryPending,
                            reason: retryPending ? CONTEXT_WINDOW_EXCEEDED_FINISH_REASON : 'threshold_exceeded',
                            fixedTokens,
                            tokenLimit: limit
                        },
                        control
                    )
                    const messages = compressed ?? request.messages
                    const stateUpdate = {
                        ...request.agentStateUpdate,
                        [COMPRESSION_NO_GAIN_RETRY_STATE_KEY]: control.noGain,
                        [COMPRESSION_FAILURE_RETRY_STATE_KEY]: control.failure,
                        [CONTEXT_WINDOW_RETRY_STATE_KEY]: retryPending,
                        [CONTEXT_WINDOW_RETRY_PENDING_KEY]: false,
                        ...(compressed
                            ? { messages: [new RemoveMessage({ id: REMOVE_ALL_MESSAGES }), ...compressed] }
                            : {})
                    }
                    try {
                        // A provider-rejected request must change before it can be retried.
                        if (retryPending && !compressed) throw new Error(this.budgetError())
                        return await handler({
                            ...request,
                            messages,
                            validateRequest: async (finalRequest) => {
                                await request.validateRequest?.(finalRequest)
                                const finalMessages = finalRequest.finalMessages ?? finalRequest.messages
                                if (!retainsRequiredContext(messages, finalMessages)) {
                                    const message = t('server-ai:Error.ContextCompressionContextChanged', {
                                        defaultValue:
                                            'The final model request lost accepted context or the latest user input. The request was not sent.'
                                    })
                                    this.emitCompressionChunk(compressionRuntime, {
                                        id: uuid(),
                                        status: 'fail',
                                        reason: 'context_validation_failed',
                                        message,
                                        error: message
                                    })
                                    throw new Error(message)
                                }
                                const schemas = finalRequest.tools.map((tool) =>
                                    'schema' in tool ? convertToOpenAITool(tool) : tool
                                )
                                const fixed =
                                    (!finalRequest.finalMessages && finalRequest.systemMessage
                                        ? estimateContextMessages([finalRequest.systemMessage])
                                        : 0) + estimateContextText(JSON.stringify(schemas))
                                const candidate = finalRequest.runtime.configurable?.copilotModel ?? model
                                const sameModel =
                                    candidate.model === model.model && candidate.copilotId === model.copilotId
                                const candidateLimit =
                                    getModelContextSize(candidate) ??
                                    (sameModel
                                        ? limit
                                        : await this.resolveCompressionTokenLimit(candidate, () =>
                                              middlewareRuntime.createModelClient<BaseLanguageModel>(candidate, {})
                                          ))
                                if (!candidateLimit) return
                                const candidateMessages = sameModel
                                    ? finalMessages
                                    : this.history.invalidateUsage(finalMessages)
                                const complete = await this.budget.estimatePromptWindowUsage(
                                    candidateMessages,
                                    candidate,
                                    candidateLimit,
                                    resolvedOptions.threshold,
                                    fixed
                                )
                                if (
                                    complete.estimatedPromptTokens +
                                        complete.reservedOutputTokens +
                                        Math.ceil(candidateLimit * 0.05) >
                                    candidateLimit
                                ) {
                                    this.emitCompressionChunk(compressionRuntime, {
                                        id: uuid(),
                                        status: 'fail',
                                        reason: 'context_budget_exceeded',
                                        message: this.budgetError(),
                                        error: this.budgetError()
                                    })
                                    throw new Error(this.budgetError())
                                }
                            },
                            agentStateUpdate: stateUpdate
                        })
                    } catch (error) {
                        preserveModelRequestState(error, stateUpdate)
                    }
                }

                const result = this.readManualCompressionResultFromRequestState(request.state, context.agentKey)
                return new AIMessage({
                    content: result?.message ?? MANUAL_COMPRESSION_SUCCESS_MESSAGE,
                    additional_kwargs: {
                        contextCompressionManualCommand: true,
                        contextCompressionStatus: result?.status ?? 'compressed'
                    }
                })
            },
            afterModel: {
                canJumpTo: ['model'],
                hook: async (state) => {
                    const messages = state.messages

                    if (!messages || messages.length === 0) {
                        return
                    }

                    const retryAlreadyApplied =
                        isStateContainer(state) && Reflect.get(state, CONTEXT_WINDOW_RETRY_STATE_KEY) === true
                    const lastMessage = messages[messages.length - 1]
                    const finishReason = this.getFinishReason(lastMessage)

                    if (finishReason !== CONTEXT_WINDOW_EXCEEDED_FINISH_REASON) {
                        if (retryAlreadyApplied) {
                            return {
                                [CONTEXT_WINDOW_RETRY_STATE_KEY]: false,
                                [CONTEXT_WINDOW_RETRY_PENDING_KEY]: false
                            }
                        }
                        return
                    }

                    if (retryAlreadyApplied) {
                        this.logger.warn(
                            'Model still exceeded context window after fallback compression retry; skipping additional automatic retries.'
                        )
                        return {
                            [CONTEXT_WINDOW_RETRY_STATE_KEY]: false,
                            [CONTEXT_WINDOW_RETRY_PENDING_KEY]: false
                        }
                    }

                    this.logger.warn(
                        'Model returned finish_reason=model_context_window_exceeded. Triggering fallback compression retry.'
                    )

                    const messagesToRetry = isAIMessage(lastMessage) ? messages.slice(0, -1) : messages

                    if (messagesToRetry.length === 0) {
                        this.logger.warn('No messages available for fallback compression retry.')
                        return
                    }

                    // Remove the rejected answer before re-entering model preparation,
                    // so it cannot cause the current user input to be injected twice.
                    return {
                        messages: [new RemoveMessage({ id: REMOVE_ALL_MESSAGES }), ...messagesToRetry],
                        [CONTEXT_WINDOW_RETRY_STATE_KEY]: true,
                        [CONTEXT_WINDOW_RETRY_PENDING_KEY]: true,
                        jumpTo: 'model'
                    }
                }
            }
        }
    }
}
