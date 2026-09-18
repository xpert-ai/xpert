import { Logger } from '@nestjs/common'
import { BaseMessage, isToolMessage } from '@langchain/core/messages'
import { BaseLanguageModel } from '@langchain/core/language_models/base'
import { AgentMiddlewareRuntimeApi, IAgentMiddlewareContext, getModelContextSize } from '@xpert-ai/plugin-sdk'
import {
    ChatMessageTypeEnum,
    CONTEXT_COMPRESSION_COMPONENT_TYPE,
    TAgentRunnableConfigurable,
    TContextCompressionComponentData,
    TContextCompressionComponentReason,
    TContextCompressionComponentStatus,
    TMessageContentComponent
} from '@xpert-ai/contracts'
import { isGraphInterrupt } from '@langchain/langgraph'
import { createHash } from 'node:crypto'
import { v4 as uuid } from 'uuid'
import { t } from 'i18next'
import { ContextCompressionHistory } from './context-compression.history'
import {
    COMPRESSION_NO_GAIN_RETRY_STATE_KEY,
    COMPRESSION_FAILURE_RETRY_STATE_KEY,
    COMPRESSION_NO_GAIN_RETRY_MIN_TOKEN_DELTA,
    MANUAL_COMPRESSION_FALLBACK_SNAPSHOT,
    COMPRESSION_NO_UNPROTECTED_HISTORY_MESSAGE,
    COMPRESSION_SOFT_PROTECTION_MESSAGE,
    CompressionDisplayText,
    CONTEXT_COMPRESSION_TITLE,
    COMPRESSION_RUNNING_DISPLAY,
    COMPRESSION_COMPLETED_DISPLAY,
    COMPRESSION_NO_MESSAGES_DISPLAY,
    COMPRESSION_NO_UNPROTECTED_HISTORY_DISPLAY,
    COMPRESSION_NO_MODEL_DISPLAY,
    COMPRESSION_NO_TOKEN_LIMIT_DISPLAY,
    CompressionNoGainRetryStateSchema,
    CompressionFailureRetryStateSchema,
    ContextSummaryError,
    CompressionNoGainRetryState,
    ResolvedContextCompressionOptions,
    CompressionExecutionOptions,
    PromptWindowEstimate,
    isStateContainer
} from './context-compression.shared'
import { findCompressSplitPoint } from './context-compression.history'
import {
    estimateTokens,
    estimateTokenCountSync,
    estimatePromptWindowUsage,
    estimateFixedInputTokens,
    fitsPromptBudget,
    limitSummaryModelOutput
} from './context-compression.budget'

export class ContextCompressionEngine {
    private readonly logger = new Logger(ContextCompressionEngine.name)
    private readonly history = new ContextCompressionHistory()

    constructor(private readonly tools?: IAgentMiddlewareContext['tools']) {}

    emitCompressionUnavailable(
        runtime: { configurable?: TAgentRunnableConfigurable },
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

    emitCompressionSkipped(
        runtime: { configurable?: TAgentRunnableConfigurable },
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

    readNoGainRetryState(stateContainer: unknown): CompressionNoGainRetryState | null {
        if (!isStateContainer(stateContainer)) {
            return null
        }

        const parsed = CompressionNoGainRetryStateSchema.safeParse(
            Reflect.get(stateContainer, COMPRESSION_NO_GAIN_RETRY_STATE_KEY)
        )

        return parsed.success ? parsed.data : null
    }

    readFailureRetryState(stateContainer: unknown) {
        if (!isStateContainer(stateContainer)) return null
        const parsed = CompressionFailureRetryStateSchema.safeParse(
            Reflect.get(stateContainer, COMPRESSION_FAILURE_RETRY_STATE_KEY)
        )
        return parsed.success ? parsed.data : null
    }

    compressionRetryKey(messages: BaseMessage[], model: TAgentRunnableConfigurable['copilotModel']): string {
        return createHash('sha256')
            .update(
                JSON.stringify({
                    model: model.model,
                    copilotId: model.copilotId,
                    options: model.options,
                    messages: messages.map((message) => ({ type: message._getType(), content: message.content }))
                })
            )
            .digest('hex')
    }

    compressionStateUpdate(state: unknown) {
        return {
            [COMPRESSION_NO_GAIN_RETRY_STATE_KEY]: this.readNoGainRetryState(state),
            [COMPRESSION_FAILURE_RETRY_STATE_KEY]: this.readFailureRetryState(state)
        }
    }

    clearNoGainRetryState(stateContainer?: unknown): void {
        if (!isStateContainer(stateContainer)) {
            return
        }
        Reflect.deleteProperty(stateContainer, COMPRESSION_NO_GAIN_RETRY_STATE_KEY)
    }

    recordNoGainRetryState(
        stateContainer: unknown,
        currentTokenCount: number,
        newTokenCount: number,
        promptWindowEstimate: PromptWindowEstimate,
        tokenLimit: number
    ): void {
        if (!isStateContainer(stateContainer)) {
            return
        }

        const retryTokenDelta = Math.max(COMPRESSION_NO_GAIN_RETRY_MIN_TOKEN_DELTA, Math.ceil(currentTokenCount * 0.1))
        const retryPromptDelta = Math.max(
            COMPRESSION_NO_GAIN_RETRY_MIN_TOKEN_DELTA,
            Math.ceil(promptWindowEstimate.estimatedPromptTokens * 0.1)
        )

        Reflect.set(stateContainer, COMPRESSION_NO_GAIN_RETRY_STATE_KEY, {
            currentTokenCount,
            newTokenCount,
            tokenLimit,
            estimatedPromptTokens: promptWindowEstimate.estimatedPromptTokens,
            projectedTotalTokens: promptWindowEstimate.projectedTotalTokens,
            effectivePromptBudget: promptWindowEstimate.effectivePromptBudget,
            fixedInputTokens: promptWindowEstimate.fixedInputTokens,
            retryAfterTokenCount: currentTokenCount + retryTokenDelta,
            retryAfterPromptTokens: promptWindowEstimate.estimatedPromptTokens + retryPromptDelta
        } satisfies CompressionNoGainRetryState)
    }

    shouldSkipCompressionAfterNoGain(
        stateContainer: unknown,
        currentTokenCount: number,
        promptWindowEstimate: PromptWindowEstimate,
        tokenLimit: number,
        forceCompression: boolean
    ): boolean {
        if (forceCompression) {
            return false
        }

        const retryState = this.readNoGainRetryState(stateContainer)
        if (!retryState) {
            return false
        }

        const budgetTightened = promptWindowEstimate.effectivePromptBudget < retryState.effectivePromptBudget
        if (
            tokenLimit !== retryState.tokenLimit ||
            budgetTightened ||
            promptWindowEstimate.fixedInputTokens !== retryState.fixedInputTokens
        ) {
            this.clearNoGainRetryState(stateContainer)
            return false
        }

        if (
            currentTokenCount < retryState.retryAfterTokenCount &&
            promptWindowEstimate.estimatedPromptTokens < retryState.retryAfterPromptTokens
        ) {
            this.logger.debug(
                `Skipping compression after previous no-gain result: current tokens ${currentTokenCount}/${retryState.retryAfterTokenCount}, prompt tokens ${promptWindowEstimate.estimatedPromptTokens}/${retryState.retryAfterPromptTokens}`
            )
            return true
        }

        this.clearNoGainRetryState(stateContainer)
        return false
    }

    async shouldSkipCompressionBeforeModel(
        messages: BaseMessage[],
        runtime: { configurable?: TAgentRunnableConfigurable },
        options: ResolvedContextCompressionOptions,
        stateContainer: unknown
    ): Promise<boolean> {
        const retryState = this.readNoGainRetryState(stateContainer)
        if (!retryState) {
            return false
        }

        const configurable = runtime?.configurable as TAgentRunnableConfigurable | undefined
        const model = configurable?.copilotModel
        if (!model) {
            return false
        }

        const currentTokenCount = await estimateTokens(messages)
        if (currentTokenCount >= retryState.retryAfterTokenCount) {
            this.clearNoGainRetryState(stateContainer)
            return false
        }

        const tokenLimit = getModelContextSize(model) ?? retryState.tokenLimit
        if (!tokenLimit || tokenLimit <= 0) {
            return false
        }

        const promptWindowEstimate = await estimatePromptWindowUsage(
            messages,
            model,
            tokenLimit,
            options.threshold,
            estimateFixedInputTokens(stateContainer, messages, this.tools)
        )

        return this.shouldSkipCompressionAfterNoGain(
            stateContainer,
            currentTokenCount,
            promptWindowEstimate,
            tokenLimit,
            false
        )
    }

    async resolveCompressionTokenLimit(
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

    emitCompressionChunk(
        runtime: { configurable?: TAgentRunnableConfigurable },
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

    // ============================================================================
    // First Layer: Pruning - Reference: OpenCode
    // ============================================================================

    async compressMessages(
        messages: BaseMessage[],
        runtime: { configurable?: TAgentRunnableConfigurable },
        middlewareRuntime: AgentMiddlewareRuntimeApi,
        options: ResolvedContextCompressionOptions,
        execution: CompressionExecutionOptions,
        stateContainer?: unknown
    ): Promise<BaseMessage[] | null> {
        if (!messages.length) {
            if (execution.reason === 'manual') {
                this.emitCompressionSkipped(runtime, COMPRESSION_NO_MESSAGES_DISPLAY, 'no_messages')
            }
            return null
        }

        const configurable = runtime?.configurable as TAgentRunnableConfigurable | undefined
        const model = configurable?.copilotModel

        if (!model) {
            this.logger.warn('No configurable.copilotModel available for compression')
            if (execution.reason === 'manual') {
                this.emitCompressionUnavailable(runtime, COMPRESSION_NO_MODEL_DISPLAY)
            }
            return null
        }

        const fingerprint = this.compressionRetryKey(messages, model)
        const failure = this.readFailureRetryState(stateContainer)
        const executionId = configurable.rootExecutionId ?? configurable.executionId
        if (
            execution.reason !== 'manual' &&
            failure?.fingerprint === fingerprint &&
            ((executionId && failure.executionId === executionId) || Date.now() < failure.nextRetryAt)
        )
            return null
        if (isStateContainer(stateContainer))
            Reflect.deleteProperty(stateContainer, COMPRESSION_FAILURE_RETRY_STATE_KEY)
        let compressionModelClient: BaseLanguageModel | null = null
        let summaryOutputBudget: number | undefined
        const getCompressionModel = async (outputBudget?: number): Promise<BaseLanguageModel> => {
            if (compressionModelClient && outputBudget === summaryOutputBudget) {
                return compressionModelClient
            }
            summaryOutputBudget = outputBudget
            const summaryModel = outputBudget === undefined ? model : limitSummaryModelOutput(model, outputBudget)
            compressionModelClient = await middlewareRuntime.createModelClient<BaseLanguageModel>(summaryModel, {
                usageCallback: (event) => {
                    this.logger.debug('[Compression Middleware] Model usage:', event)
                }
            })
            return compressionModelClient
        }

        let compressionId: string | null = null
        let currentMessages = messages

        try {
            const originalTokenCount = await estimateTokens(messages)
            const fixedInputTokens = estimateFixedInputTokens(stateContainer, messages, this.tools)
            let tokenLimit: number | null = null

            try {
                tokenLimit = await this.resolveCompressionTokenLimit(model, getCompressionModel)
            } catch (error) {
                this.logger.warn(
                    `Failed to resolve token limit from model profile: ${error instanceof Error ? error.message : String(error)}`
                )
            }

            if (!tokenLimit || tokenLimit <= 0) {
                this.logger.warn('Unable to resolve token limit from configurable.copilotModel')
                if (execution.reason === 'manual') {
                    this.emitCompressionUnavailable(runtime, COMPRESSION_NO_TOKEN_LIMIT_DISPLAY)
                }
                return null
            }

            const promptWindowEstimate = await estimatePromptWindowUsage(
                messages,
                model,
                tokenLimit,
                options.threshold,
                fixedInputTokens
            )
            let currentPromptWindowEstimate = promptWindowEstimate

            if (
                !execution.force &&
                promptWindowEstimate.estimatedPromptTokens <= promptWindowEstimate.effectivePromptBudget &&
                promptWindowEstimate.projectedTotalTokens <= tokenLimit
            ) {
                this.clearNoGainRetryState(stateContainer)
                this.logger.debug(
                    `No compression needed: estimated prompt ${promptWindowEstimate.estimatedPromptTokens} tokens <= effective prompt budget ${promptWindowEstimate.effectivePromptBudget} tokens (threshold budget: ${promptWindowEstimate.thresholdPromptTokens}, available prompt budget: ${promptWindowEstimate.availablePromptTokens}); reserved output ${promptWindowEstimate.reservedOutputTokens}; projected total ${promptWindowEstimate.projectedTotalTokens}/${tokenLimit}`
                )
                return null
            }

            if (
                this.shouldSkipCompressionAfterNoGain(
                    stateContainer,
                    originalTokenCount,
                    promptWindowEstimate,
                    tokenLimit,
                    execution.force
                )
            ) {
                return null
            }

            this.logger.log(
                execution.reason === 'manual'
                    ? `Triggering manual compression: ${messages.length} messages, estimated prompt ${promptWindowEstimate.estimatedPromptTokens}, effective prompt budget ${promptWindowEstimate.effectivePromptBudget}, reserved output ${promptWindowEstimate.reservedOutputTokens}, projected total ${promptWindowEstimate.projectedTotalTokens}, limit ${tokenLimit}`
                    : execution.force
                      ? `Triggering fallback compression after ${execution.reason}: ${messages.length} messages, estimated prompt ${promptWindowEstimate.estimatedPromptTokens}, effective prompt budget ${promptWindowEstimate.effectivePromptBudget}, reserved output ${promptWindowEstimate.reservedOutputTokens}, projected total ${promptWindowEstimate.projectedTotalTokens}, limit ${tokenLimit}`
                      : `Triggering compression: ${messages.length} messages, estimated prompt ${promptWindowEstimate.estimatedPromptTokens}, effective prompt budget ${promptWindowEstimate.effectivePromptBudget}, reserved output ${promptWindowEstimate.reservedOutputTokens}, projected total ${promptWindowEstimate.projectedTotalTokens}, limit ${tokenLimit}`
            )

            const currentCompressionId = uuid()
            compressionId = currentCompressionId
            this.emitCompressionChunk(runtime, {
                id: currentCompressionId,
                status: 'running',
                message: COMPRESSION_RUNNING_DISPLAY
            })

            let currentTokenCount = originalTokenCount
            const reportBudgetFailure = () => {
                this.recordNoGainRetryState(
                    stateContainer,
                    currentTokenCount,
                    currentTokenCount,
                    currentPromptWindowEstimate,
                    tokenLimit
                )
                const message = t('server-ai:Error.ContextCompressionBudgetExceeded', {
                    defaultValue:
                        'The preserved input still exceeds the context budget. Reduce the input or use a larger context window.'
                })
                this.emitCompressionChunk(runtime, {
                    id: currentCompressionId,
                    status: 'fail',
                    reason: 'context_budget_exceeded',
                    message,
                    error: message
                })
                return currentMessages !== messages ? currentMessages : null
            }

            // Keep configured tool limits as ceilings, scaled down by the existing prompt budget when needed.
            const promptBudget = promptWindowEstimate.effectivePromptBudget
            const needsSmallerLimits =
                options.toolOutputBudget > promptBudget ||
                options.pruneProtectTokens + options.pruneMinimumTokens > promptBudget
            const pruneProtectTokens = needsSmallerLimits
                ? Math.min(options.pruneProtectTokens, Math.floor(promptBudget * options.preserveFraction))
                : options.pruneProtectTokens
            const pruneMinimumTokens = needsSmallerLimits
                ? Math.min(
                      options.pruneMinimumTokens,
                      Math.max(1, Math.ceil(promptWindowEstimate.estimatedPromptTokens - promptBudget))
                  )
                : options.pruneMinimumTokens

            if (options.enableTwoPhase) {
                const pruneResult = await this.history.pruneOldToolOutputs(currentMessages, {
                    pruneProtectTokens,
                    pruneMinimumTokens,
                    protectedUserTurns: options.protectedUserTurns
                })

                if (pruneResult.prunedTokens > 0) {
                    currentMessages = pruneResult.messages
                    currentTokenCount = await estimateTokens(currentMessages)
                    const prunedWindowEstimate = await estimatePromptWindowUsage(
                        currentMessages,
                        model,
                        tokenLimit,
                        options.threshold,
                        fixedInputTokens
                    )
                    currentPromptWindowEstimate = prunedWindowEstimate

                    this.logger.log(
                        `After first layer pruning: ${currentTokenCount} tokens (saved ${pruneResult.prunedTokens} tokens)`
                    )

                    if (
                        prunedWindowEstimate.estimatedPromptTokens <= prunedWindowEstimate.effectivePromptBudget &&
                        prunedWindowEstimate.projectedTotalTokens <= tokenLimit
                    ) {
                        this.clearNoGainRetryState(stateContainer)
                        this.logger.log(
                            `First layer pruning sufficient, no further compression needed: estimated prompt ${prunedWindowEstimate.estimatedPromptTokens} <= effective prompt budget ${prunedWindowEstimate.effectivePromptBudget}; reserved output ${prunedWindowEstimate.reservedOutputTokens}; projected total ${prunedWindowEstimate.projectedTotalTokens}/${tokenLimit}`
                        )
                        this.emitCompressionChunk(runtime, {
                            id: currentCompressionId,
                            status: 'success',
                            message: COMPRESSION_COMPLETED_DISPLAY
                        })
                        return currentMessages
                    }
                }
            }

            this.logger.log('First layer pruning insufficient, starting second layer summary compression...')

            const nonToolTokens = await estimateTokens(currentMessages.filter((message) => !isToolMessage(message)))
            const toolOutputBudget = Math.max(
                0,
                Math.min(options.toolOutputBudget, promptBudget - fixedInputTokens - nonToolTokens)
            )
            const truncatedHistory = await this.history.truncateHistoryToBudget(currentMessages, toolOutputBudget)
            currentMessages = truncatedHistory
            currentTokenCount = await estimateTokens(currentMessages)
            currentPromptWindowEstimate = await estimatePromptWindowUsage(
                currentMessages,
                model,
                tokenLimit,
                options.threshold,
                fixedInputTokens
            )

            if (
                execution.reason !== 'manual' &&
                currentMessages !== messages &&
                fitsPromptBudget(currentPromptWindowEstimate, tokenLimit)
            ) {
                this.clearNoGainRetryState(stateContainer)
                this.emitCompressionChunk(runtime, {
                    id: currentCompressionId,
                    status: 'success',
                    message: COMPRESSION_COMPLETED_DISPLAY
                })
                return currentMessages
            }

            const splitResult = findCompressSplitPoint(
                truncatedHistory,
                1 - options.preserveFraction,
                options.protectedUserTurns
            )

            const historyToCompress = truncatedHistory.slice(0, splitResult.splitPoint)
            const historyToKeep = truncatedHistory.slice(splitResult.splitPoint)

            if (historyToCompress.length === 0) {
                if (!fitsPromptBudget(currentPromptWindowEstimate, tokenLimit)) return reportBudgetFailure()
                this.logger.debug(COMPRESSION_NO_UNPROTECTED_HISTORY_MESSAGE)
                if (currentMessages !== messages) {
                    this.clearNoGainRetryState(stateContainer)
                }
                this.emitCompressionChunk(runtime, {
                    id: currentCompressionId,
                    status: 'success',
                    message:
                        currentMessages !== messages
                            ? COMPRESSION_COMPLETED_DISPLAY
                            : COMPRESSION_NO_UNPROTECTED_HISTORY_DISPLAY,
                    ...(currentMessages !== messages ? {} : { reason: 'no_unprotected_history' })
                })
                return currentMessages !== messages ? currentMessages : null
            }

            this.logger.log(
                `Compressing ${historyToCompress.length} messages, keeping ${historyToKeep.length} messages`
            )

            // Manual /compact is a control operation, not a semantic hand-off.
            // A model-written summary can be compact yet stale about external
            // tools, files, and immutable project state. Always replace the old
            // history with a state-free snapshot and require the next turn to
            // re-read authoritative state. Automatic threshold compression may
            // still use the model summary below.
            if (execution.reason === 'manual') {
                const fallbackHistory = this.history.buildNewHistory(
                    MANUAL_COMPRESSION_FALLBACK_SNAPSHOT,
                    historyToKeep,
                    currentCompressionId,
                    historyToCompress.length,
                    originalTokenCount
                )
                const fallbackTokenCount = await estimateTokens(fallbackHistory)
                this.clearNoGainRetryState(stateContainer)
                this.logger.log(
                    `Applied deterministic manual compression snapshot: ${originalTokenCount} → ${fallbackTokenCount} tokens.`
                )
                this.emitCompressionChunk(runtime, {
                    id: currentCompressionId,
                    status: 'success',
                    message: COMPRESSION_COMPLETED_DISPLAY,
                    summary: MANUAL_COMPRESSION_FALLBACK_SNAPSHOT
                })
                return fallbackHistory
            }

            // Include the summary envelope and acknowledgement before reserving space for its body.
            const emptySummaryHistory = this.history.buildNewHistory(
                '',
                historyToKeep,
                currentCompressionId,
                historyToCompress.length,
                originalTokenCount
            )
            const summaryBudget = Math.floor(
                Math.min(
                    promptBudget - fixedInputTokens - (await estimateTokens(emptySummaryHistory)),
                    (await estimateTokens(historyToCompress)) - 1,
                    currentPromptWindowEstimate.reservedOutputTokens
                )
            )
            const minimumSummaryTokens = estimateTokenCountSync(JSON.stringify('<state_snapshot>x</state_snapshot>'))
            if (summaryBudget < minimumSummaryTokens) return reportBudgetFailure()
            const compressionModel = await getCompressionModel(summaryBudget)

            const snapshot = await this.history.generateStateSnapshot(historyToCompress, compressionModel, {
                tokenLimit: Math.min(tokenLimit, getModelContextSize(compressionModel) ?? tokenLimit),
                outputTokens: summaryBudget
            })

            const newHistory = this.history.buildNewHistory(
                snapshot,
                historyToKeep,
                currentCompressionId,
                historyToCompress.length,
                originalTokenCount
            )

            const newTokenCount = await estimateTokens(newHistory)

            const summaryEstimate = await estimatePromptWindowUsage(
                newHistory,
                model,
                tokenLimit,
                options.threshold,
                fixedInputTokens
            )
            if (!fitsPromptBudget(summaryEstimate, tokenLimit) || newTokenCount >= originalTokenCount)
                return reportBudgetFailure()

            const compressionRatio = Math.round((newTokenCount / originalTokenCount) * 100)
            const compressionStats = `Two-phase compression complete: ${historyToCompress.length} messages → 1 summary | ${originalTokenCount} → ${newTokenCount} tokens (${compressionRatio}%)`

            this.clearNoGainRetryState(stateContainer)
            this.logger.log(`✅ ${compressionStats}`)

            this.emitCompressionChunk(runtime, {
                id: currentCompressionId,
                message: compressionStats,
                summary: splitResult.softenedProtection
                    ? `${COMPRESSION_SOFT_PROTECTION_MESSAGE}\n\n${snapshot}`
                    : snapshot,
                status: 'success'
            })

            return newHistory
        } catch (error) {
            if (isGraphInterrupt(error) || (error instanceof Error && error.name === 'AbortError')) throw error
            this.clearNoGainRetryState(stateContainer)
            if (isStateContainer(stateContainer))
                Reflect.set(stateContainer, COMPRESSION_FAILURE_RETRY_STATE_KEY, {
                    fingerprint: this.compressionRetryKey(currentMessages, model),
                    executionId,
                    nextRetryAt: Date.now() + 1000
                })
            if (compressionId) {
                const reason = error instanceof ContextSummaryError ? error.reason : 'summary_service_error'
                const key =
                    reason === 'summary_invalid'
                        ? 'ContextCompressionSummaryInvalid'
                        : reason === 'summary_input_budget'
                          ? 'ContextCompressionSummaryInputBudget'
                          : reason === 'summary_output_budget'
                            ? 'ContextCompressionSummaryOutputBudget'
                            : 'ContextCompressionSummaryServiceError'
                const errorMessage = t(`server-ai:Error.${key}`, {
                    defaultValue: 'Context summary failed and was not applied.'
                })
                this.emitCompressionChunk(runtime, {
                    id: compressionId,
                    status: 'fail',
                    reason,
                    error: errorMessage,
                    message: errorMessage
                })
            }
            this.logger.error('Compression error:', error)
            return currentMessages !== messages ? currentMessages : null
        }
    }
}
