// Invariants: compression updates are checkpointed before the model runs.
// Manual compaction remains deterministic; automatic compression preserves the latest user request.
// Completed tool output may be truncated even within the latest user turn to fit its remaining budget.
import { Inject, Injectable, Logger } from '@nestjs/common'
import { AIMessage, BaseMessage, RemoveMessage, isAIMessage } from '@langchain/core/messages'
import {
    AgentMiddleware,
    AgentMiddlewareStrategy,
    IAgentMiddlewareContext,
    IAgentMiddlewareStrategy,
    PromiseOrValue
} from '@xpert-ai/plugin-sdk'
import { REMOVE_ALL_MESSAGES } from '@langchain/langgraph'
import { channelName, CONTEXT_COMPRESSION_MIDDLEWARE_NAME, TAgentMiddlewareMeta } from '@xpert-ai/contracts'
import { ContextCompressionEngine } from './context-compression.engine'
import { ContextEvidenceService } from '../chat-conversation/context-evidence/context-evidence.service'
import { createContextEvidenceTool } from './context-evidence.tool'
import { CONTEXT_EVIDENCE_TOOL } from '../chat-conversation/context-evidence/context-evidence.schema'
import { t } from 'i18next'
import { toolOperationDecision } from '../xpert/template-setup/template-operation-policy'
import {
    DEFAULT_COMPRESSION_TOKEN_THRESHOLD,
    DEFAULT_RECOVERABLE_PROMPT_TOKENS,
    COMPRESSION_PRESERVE_THRESHOLD,
    COMPRESSION_TOOL_RESPONSE_TOKEN_BUDGET,
    PRUNE_MINIMUM_TOKENS,
    PRUNE_PROTECT_TOKENS,
    PROTECTED_USER_TURNS,
    CONTEXT_WINDOW_EXCEEDED_FINISH_REASON,
    CONTEXT_WINDOW_RETRY_STATE_KEY,
    MANUAL_COMPRESSION_RESULT_STATE_KEY,
    MANUAL_COMPRESSION_SUCCESS_MESSAGE,
    MANUAL_COMPRESSION_SKIPPED_MESSAGE,
    ManualCompressionResultSchema,
    ContextCompressionStateSchema,
    RecoveryCompressionOptionsSchema,
    ManualCompressionResult,
    ContextCompressionMiddlewareOptions,
    ResolvedContextCompressionOptions,
    isStateContainer
} from './context-compression.shared'
import {
    isManualContextCompressionCommand,
    hasTrailingManualContextCompressionCommand,
    getManualCompressionHistory,
    getFinishReason
} from './context-compression.history'

export {
    DEFAULT_COMPRESSION_TOKEN_THRESHOLD,
    COMPRESSION_PRESERVE_THRESHOLD,
    COMPRESSION_TOOL_RESPONSE_TOKEN_BUDGET,
    COMPRESSION_TRUNCATE_LINES,
    PRUNE_MINIMUM_TOKENS,
    PRUNE_PROTECT_TOKENS,
    PROTECTED_USER_TURNS,
    PROTECTED_TOOLS,
    ContextCompressionMiddlewareOptions
} from './context-compression.shared'

@Injectable()
@AgentMiddlewareStrategy(CONTEXT_COMPRESSION_MIDDLEWARE_NAME)
export class ContextCompressionMiddleware implements IAgentMiddlewareStrategy {
    constructor(@Inject(ContextEvidenceService) private readonly evidence: Pick<ContextEvidenceService, 'bind'>) {}
    readonly meta: TAgentMiddlewareMeta = {
        name: CONTEXT_COMPRESSION_MIDDLEWARE_NAME,
        label: {
            en_US: 'Context Compression Middleware',
            zh_Hans: '上下文压缩中间件'
        },
        icon: {
            type: 'svg',
            value: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v8m-4-4h8"/></svg>`
        },
        description: {
            en_US: 'Archive completed history before summarizing it. Preserve user instructions and recent work, and recover original records on demand.',
            zh_Hans: '已完成的旧历史先归档再摘要；保留用户原始要求与近期工作，需要时按片段取回原文。'
        },
        slashCommands: [
            {
                name: 'compact',
                aliases: ['compress'],
                label: {
                    en_US: 'Compress',
                    zh_Hans: '压缩'
                },
                description: {
                    en_US: 'Compress this thread context',
                    zh_Hans: '压缩此线程的上下文'
                },
                category: 'session',
                kind: 'command',
                action: {
                    type: 'submit_prompt',
                    template: '/compact'
                }
            }
        ],
        // Recovery budgets remain internal; preserve the existing authoring controls.
        configSchema: {
            type: 'object',
            properties: {
                threshold: {
                    type: 'number',
                    default: DEFAULT_COMPRESSION_TOKEN_THRESHOLD,
                    title: {
                        en_US: 'Compression Threshold',
                        zh_Hans: '压缩阈值'
                    },
                    description: {
                        en_US: 'Trigger compression when token count exceeds this fraction of model limit (0.7 = 70%)',
                        zh_Hans: '当token数量超过模型限制的此比例时触发压缩（0.7 = 70%）'
                    }
                },
                preserveFraction: {
                    type: 'number',
                    default: COMPRESSION_PRESERVE_THRESHOLD,
                    title: {
                        en_US: 'Preserve Fraction',
                        zh_Hans: '保留比例'
                    },
                    description: {
                        en_US: 'Recent original-history share of the target budget. User instructions and protected call groups may exceed this share.',
                        zh_Hans: '近期原文占目标预算的比例；用户原始要求和受保护工具周期可能超过此比例。'
                    }
                },
                enableTwoPhaseCompression: {
                    type: 'boolean',
                    default: true,
                    title: {
                        en_US: 'Enable Two-Phase Compression',
                        zh_Hans: '启用双层压缩'
                    },
                    description: {
                        en_US: 'Legacy mode only: prune old tool outputs before summarizing.',
                        zh_Hans: '仅旧模式生效：先修剪旧工具输出，再按需生成摘要。'
                    }
                },
                protectedUserTurns: {
                    type: 'number',
                    default: PROTECTED_USER_TURNS,
                    title: {
                        en_US: 'Protected User Turns',
                        zh_Hans: '保护的用户回合数'
                    },
                    description: {
                        en_US: 'Legacy mode only. Recoverable history preserves every original user message.',
                        zh_Hans: '仅旧模式生效；可恢复历史模式保留所有用户原始消息。'
                    }
                }
            }
        },
        configurableTools: false
    }

    readonly stateSchema = ContextCompressionStateSchema

    getToolNames(options: ContextCompressionMiddlewareOptions = {}): readonly string[] {
        return options.recoverableHistory === false ? [] : [CONTEXT_EVIDENCE_TOOL]
    }

    private readonly logger = new Logger(ContextCompressionMiddleware.name)
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
    createMiddleware(
        options: ContextCompressionMiddlewareOptions,
        context: IAgentMiddlewareContext
    ): PromiseOrValue<AgentMiddleware> {
        const middlewareRuntime = context.runtime
        const recoveryOptions = RecoveryCompressionOptionsSchema.parse(options ?? {})
        const source = recoveryOptions.recoverableHistory ? this.evidence.bind(context) : undefined
        // The host fills this live map after applying per-tool configuration and preferences.
        const tools = context.tools ?? new Map()
        const evidence = source
            ? {
                  ...source,
                  archive: (messages: BaseMessage[]) => {
                      if (
                          !tools.has(CONTEXT_EVIDENCE_TOOL) ||
                          toolOperationDecision(context.operationPolicy, CONTEXT_EVIDENCE_TOOL) !== 'allow'
                      )
                          throw new Error(t('server-ai:Error.ContextEvidenceUnavailable'))
                      return source.archive(messages)
                  }
              }
            : undefined
        const recoveryTool = evidence ? createContextEvidenceTool(evidence) : undefined
        const engine = new ContextCompressionEngine(tools, evidence)
        const resolvedOptions: ResolvedContextCompressionOptions = {
            ...recoveryOptions,
            maxPromptTokens:
                recoveryOptions.maxPromptTokens ??
                (recoveryOptions.recoverableHistory ? DEFAULT_RECOVERABLE_PROMPT_TOKENS : undefined),
            threshold: options?.threshold ?? DEFAULT_COMPRESSION_TOKEN_THRESHOLD,
            preserveFraction: options?.preserveFraction ?? COMPRESSION_PRESERVE_THRESHOLD,
            toolOutputBudget: options?.toolOutputBudget ?? COMPRESSION_TOOL_RESPONSE_TOKEN_BUDGET,
            enableTwoPhase: options?.enableTwoPhaseCompression ?? true,
            pruneProtectTokens: options?.pruneProtectTokens ?? PRUNE_PROTECT_TOKENS,
            pruneMinimumTokens: options?.pruneMinimumTokens ?? PRUNE_MINIMUM_TOKENS,
            protectedUserTurns: options?.protectedUserTurns ?? PROTECTED_USER_TURNS
        }

        return {
            name: CONTEXT_COMPRESSION_MIDDLEWARE_NAME,
            stateSchema: this.stateSchema,
            tools: recoveryTool ? [recoveryTool] : [],
            beforeModel: async (state, runtime) => {
                const compressionState = { ...state }
                const messages = state.messages ?? []

                if (this.isManualCompressionRequest(state, runtime as { state?: { human?: { input?: unknown } } })) {
                    const messagesToCompress = getManualCompressionHistory(messages)
                    const compressedMessages = await engine.compressMessages(
                        messagesToCompress,
                        runtime,
                        middlewareRuntime,
                        resolvedOptions,
                        {
                            force: true,
                            reason: 'manual'
                        },
                        compressionState
                    )
                    const result = this.createManualCompressionResult(Boolean(compressedMessages))

                    return {
                        ...(compressedMessages
                            ? {
                                  messages: [new RemoveMessage({ id: REMOVE_ALL_MESSAGES }), ...compressedMessages]
                              }
                            : {}),
                        ...engine.compressionStateUpdate(compressionState),
                        [MANUAL_COMPRESSION_RESULT_STATE_KEY]: result
                    }
                }

                if (messages.length === 0) {
                    return
                }

                if (
                    state[CONTEXT_WINDOW_RETRY_STATE_KEY] === true ||
                    (await engine.shouldSkipCompressionBeforeModel(
                        messages,
                        runtime,
                        resolvedOptions,
                        compressionState
                    ))
                ) {
                    return engine.compressionStateUpdate(compressionState)
                }

                const compressedMessages = await engine.compressMessages(
                    messages,
                    runtime,
                    middlewareRuntime,
                    resolvedOptions,
                    {
                        force: false,
                        reason: 'threshold_exceeded'
                    },
                    compressionState
                )

                return {
                    ...engine.compressionStateUpdate(compressionState),
                    ...(compressedMessages
                        ? { messages: [new RemoveMessage({ id: REMOVE_ALL_MESSAGES }), ...compressedMessages] }
                        : {})
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
                    return handler(request)
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
                hook: async (state, runtime) => {
                    const messages = state.messages

                    if (!messages || messages.length === 0) {
                        return
                    }

                    const retryAlreadyApplied =
                        isStateContainer(state) && Reflect.get(state, CONTEXT_WINDOW_RETRY_STATE_KEY) === true
                    const lastMessage = messages[messages.length - 1]
                    const finishReason = getFinishReason(lastMessage)

                    if (finishReason !== CONTEXT_WINDOW_EXCEEDED_FINISH_REASON) {
                        if (retryAlreadyApplied) {
                            return {
                                [CONTEXT_WINDOW_RETRY_STATE_KEY]: false
                            }
                        }
                        return
                    }

                    if (retryAlreadyApplied) {
                        this.logger.warn(
                            'Model still exceeded context window after fallback compression retry; skipping additional automatic retries.'
                        )
                        return {
                            [CONTEXT_WINDOW_RETRY_STATE_KEY]: false
                        }
                    }

                    this.logger.warn(
                        'Model returned finish_reason=model_context_window_exceeded. Triggering fallback compression retry.'
                    )

                    const compressionState = { ...state }
                    const messagesToRetry = isAIMessage(lastMessage) ? messages.slice(0, -1) : messages

                    if (messagesToRetry.length === 0) {
                        this.logger.warn('No messages available for fallback compression retry.')
                        return
                    }

                    if (
                        await engine.shouldSkipCompressionBeforeModel(
                            messagesToRetry,
                            runtime,
                            resolvedOptions,
                            compressionState
                        )
                    ) {
                        return engine.compressionStateUpdate(compressionState)
                    }
                    const compressedMessages = await engine.compressMessages(
                        messagesToRetry,
                        runtime,
                        middlewareRuntime,
                        resolvedOptions,
                        {
                            force: true,
                            reason: CONTEXT_WINDOW_EXCEEDED_FINISH_REASON
                        },
                        compressionState
                    )

                    if (!compressedMessages) {
                        this.logger.warn(
                            'Fallback compression retry skipped because compression did not produce a new history.'
                        )
                        return engine.compressionStateUpdate(compressionState)
                    }

                    return {
                        ...engine.compressionStateUpdate(compressionState),
                        messages: [new RemoveMessage({ id: REMOVE_ALL_MESSAGES }), ...compressedMessages],
                        [CONTEXT_WINDOW_RETRY_STATE_KEY]: true,
                        jumpTo: 'model'
                    }
                }
            }
        }
    }
}
