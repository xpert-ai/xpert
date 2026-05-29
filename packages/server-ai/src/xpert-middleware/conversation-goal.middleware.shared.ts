import {
    AIMessage,
    BaseMessage,
    HumanMessage,
    MessageContent,
    SystemMessage,
    isAIMessage
} from '@langchain/core/messages'
import { tool } from '@langchain/core/tools'
import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { InferInteropZodInput, interopParse } from '@langchain/core/utils/types'
import {
    ChatMessageEventTypeEnum,
    IThreadGoal,
    STATE_VARIABLE_HUMAN,
    TAgentMiddlewareMeta,
    ThreadGoalModelStatus,
    ThreadGoalStatus,
    createThreadGoalUpdatedEvent,
    isRunnableThreadGoalStatus
} from '@xpert-ai/contracts'
import { AgentMiddleware, IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'
import { z } from 'zod/v3'
import { ChatConversationGoalService } from '../chat-conversation/goal/conversation-goal.service'
import { getAIMessageTokenUsage } from '../xpert-agent/hooks/context-usage.hook'

export const CONVERSATION_GOAL_CLIENT_ACTION_TYPE = 'chatkit.conversation_goal.command'

export const DEFAULT_CONVERSATION_GOAL_MAX_ITERATIONS = 20

const configSchema = z.object({
    maxIterations: z.number().int().min(1).default(DEFAULT_CONVERSATION_GOAL_MAX_ITERATIONS)
})

export const conversationGoalStateSchema = z.object({
    threadGoalId: z.string().optional(),
    threadGoalObjective: z.string().optional(),
    // usage_limited is reserved for future usage-quota enforcement; this middleware does not emit it yet.
    threadGoalStatus: z.enum(['active', 'paused', 'blocked', 'usage_limited', 'budget_limited', 'complete']).optional(),
    threadGoalContinuationCount: z.number().int().min(0).default(0),
    threadGoalTurnStartedAt: z.number().optional()
})

const createGoalToolSchema = z.object({
    objective: z.string().trim().min(1)
})

const updateGoalToolSchema = z.object({
    status: z.string()
})

export type ConversationGoalMiddlewareConfig = InferInteropZodInput<typeof configSchema>

export type ConversationGoalMiddlewarePresentation = {
    middlewareName: string
    label: TAgentMiddlewareMeta['label']
    description: TAgentMiddlewareMeta['description']
}

function getMessageText(content: MessageContent | unknown): string {
    if (typeof content === 'string') {
        return content
    }

    if (Array.isArray(content)) {
        return content
            .map((part) => {
                if (typeof part === 'string') {
                    return part
                }
                if (!part || typeof part !== 'object') {
                    return ''
                }
                const text = Reflect.get(part, 'text')
                return typeof text === 'string' ? text : ''
            })
            .filter(Boolean)
            .join('\n')
    }

    return ''
}

function readBooleanProperty(container: unknown, property: string): boolean {
    return !!container && typeof container === 'object' && Reflect.get(container, property) === true
}

function isPlanModeEnabled(state: unknown): boolean {
    if (readBooleanProperty(state, 'planMode')) {
        return true
    }
    if (!state || typeof state !== 'object') {
        return false
    }
    return readBooleanProperty(Reflect.get(state, STATE_VARIABLE_HUMAN), 'planMode')
}

function readFiniteNumber(container: unknown, property: string): number | null {
    if (!container || typeof container !== 'object') {
        return null
    }
    const value = Reflect.get(container, property)
    return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function findLatestAiMessage(messages: BaseMessage[] | undefined): AIMessage | undefined {
    if (!messages?.length) {
        return undefined
    }

    for (let index = messages.length - 1; index >= 0; index -= 1) {
        const message = messages[index]
        if (isAIMessage(message)) {
            return message
        }
    }

    return undefined
}

function readMessages(state: unknown): BaseMessage[] {
    if (!state || typeof state !== 'object') {
        return []
    }
    const messages = Reflect.get(state, 'messages')
    return Array.isArray(messages) ? (messages as BaseMessage[]) : []
}

function hasToolCalls(message: AIMessage | undefined): boolean {
    return Array.isArray(message?.tool_calls) && message.tool_calls.length > 0
}

function appendHiddenGoalContext(systemMessage: SystemMessage | undefined, goalContext: string): SystemMessage {
    const currentContent =
        typeof systemMessage?.content === 'string' ? systemMessage.content : getMessageText(systemMessage?.content)
    return new SystemMessage({
        content: `${currentContent}${currentContent ? '\n\n' : ''}${goalContext}`,
        id: systemMessage?.id,
        name: systemMessage?.name,
        additional_kwargs: systemMessage?.additional_kwargs,
        response_metadata: systemMessage?.response_metadata
    })
}

function buildGoalContext(goal: {
    objective: string
    status: string
    elapsedSeconds?: number
    continuationCount?: number
}): string {
    return `<goal_context>
status: ${goal.status}
objective: ${goal.objective}
usage:
- elapsed_seconds: ${goal.elapsedSeconds ?? 0}
- continuation_count: ${goal.continuationCount ?? 0}
instructions:
- Keep working toward the objective until it is complete, blocked, or paused.
- Use get_goal when you need the latest persisted goal state.
- Use update_goal with status "complete" only when the objective is fully complete.
- Use update_goal with status "blocked" only when you cannot make meaningful progress without user input or external changes.
- Do not pause, resume, clear, or replace the goal; those actions are user-controlled.
</goal_context>`
}

function createContinuationMessage(): HumanMessage {
    return new HumanMessage(
        'Continue working toward the active goal. If the goal is complete, call update_goal with status "complete". If you are blocked, call update_goal with status "blocked". Otherwise make concrete progress and continue.'
    )
}

function normalizeModelStatus(value: string): ThreadGoalModelStatus {
    if (value !== 'complete' && value !== 'blocked') {
        throw new Error('update_goal only supports complete or blocked status.')
    }
    return value
}

async function dispatchGoalUpdated(goal: IThreadGoal | null | undefined) {
    if (!goal) {
        return
    }
    await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_CHAT_EVENT, createThreadGoalUpdatedEvent(goal)).catch(
        (error) => {
            console.error(error)
        }
    )
}

export function buildConversationGoalSlashCommands(): NonNullable<TAgentMiddlewareMeta['slashCommands']> {
    return [
        {
            name: 'goal',
            label: 'Goal',
            description: {
                en_US: 'Create, inspect, pause, resume, edit, or clear the conversation goal.',
                zh_Hans: '创建、查看、暂停、恢复、编辑或清除当前会话目标。'
            },
            argsHint: '[objective|pause|resume|clear|edit <objective>]',
            category: 'session',
            kind: 'command',
            action: {
                type: 'client_action',
                action: {
                    type: CONVERSATION_GOAL_CLIENT_ACTION_TYPE
                }
            }
        }
    ]
}

export function buildConversationGoalMiddlewareMeta(
    presentation: ConversationGoalMiddlewarePresentation
): TAgentMiddlewareMeta {
    return {
        name: presentation.middlewareName,
        icon: {
            type: 'svg',
            value: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/></svg>'
        },
        label: presentation.label,
        description: presentation.description,
        slashCommands: buildConversationGoalSlashCommands(),
        configSchema: {
            type: 'object',
            properties: {
                maxIterations: {
                    type: 'number',
                    title: {
                        en_US: 'Max automatic continuations',
                        zh_Hans: '最大自动续跑次数'
                    },
                    default: DEFAULT_CONVERSATION_GOAL_MAX_ITERATIONS,
                    minimum: 1
                }
            }
        } as TAgentMiddlewareMeta['configSchema']
    }
}

export function buildConversationGoalAgentMiddleware(
    goalService: ChatConversationGoalService,
    options: ConversationGoalMiddlewareConfig,
    context: IAgentMiddlewareContext,
    presentation: ConversationGoalMiddlewarePresentation
): AgentMiddleware {
    const config = interopParse(configSchema, options)
    const conversationId = context.conversationId?.trim()
    const middlewareName = presentation.middlewareName

    return {
        name: middlewareName,
        stateSchema: conversationGoalStateSchema,
        tools: [
            tool(
                async () => {
                    if (!conversationId) {
                        return null
                    }
                    return goalService.getByConversationId(conversationId)
                },
                {
                    name: 'get_goal',
                    description: 'Read the current persisted conversation goal.',
                    schema: z.object({})
                }
            ),
            tool(
                async (input) => {
                    if (!conversationId) {
                        throw new Error('create_goal requires a conversationId.')
                    }
                    const goal = await goalService.createGoalFromModel(conversationId, input.objective)
                    await dispatchGoalUpdated(goal)
                    return goal
                },
                {
                    name: 'create_goal',
                    description: 'Create a persistent goal for this conversation. Fails when a goal already exists.',
                    schema: createGoalToolSchema
                }
            ),
            tool(
                async (input) => {
                    if (!conversationId) {
                        throw new Error('update_goal requires a conversationId.')
                    }
                    const goal = await goalService.updateGoalFromModel(
                        conversationId,
                        normalizeModelStatus(input.status)
                    )
                    await dispatchGoalUpdated(goal)
                    return goal
                },
                {
                    name: 'update_goal',
                    description: 'Mark the current goal as complete or blocked. Only complete and blocked are allowed.',
                    schema: updateGoalToolSchema
                }
            )
        ],
        beforeAgent: {
            hook: async (state) => {
                if (!conversationId) {
                    return undefined
                }
                const goal = await goalService.getByConversationId(conversationId)
                if (!goal) {
                    return {
                        threadGoalContinuationCount: 0,
                        threadGoalStatus: undefined
                    }
                }

                return {
                    threadGoalId: goal.id,
                    threadGoalObjective: goal.objective,
                    threadGoalStatus: goal.status,
                    threadGoalContinuationCount: 0,
                    ...(isRunnableThreadGoalStatus(goal.status) && !isPlanModeEnabled(state)
                        ? {
                              threadGoalTurnStartedAt: Date.now()
                          }
                        : {})
                }
            }
        },
        wrapModelCall: async (request, handler) => {
            if (!conversationId || isPlanModeEnabled(request.state)) {
                return handler(request)
            }

            const goal = await goalService.getByConversationId(conversationId)
            if (!goal || !isRunnableThreadGoalStatus(goal.status)) {
                return handler(request)
            }

            return handler({
                ...request,
                systemMessage: appendHiddenGoalContext(request.systemMessage, buildGoalContext(goal))
            })
        },
        afterModel: {
            canJumpTo: ['model'],
            hook: async (state) => {
                if (!conversationId || isPlanModeEnabled(state)) {
                    return undefined
                }

                const goal = await goalService.getByConversationId(conversationId)
                if (!goal || !isRunnableThreadGoalStatus(goal.status)) {
                    return goal
                        ? {
                              threadGoalContinuationCount: 0,
                              threadGoalStatus: goal.status
                          }
                        : undefined
                }

                const messages = readMessages(state)
                const latestAiMessage = findLatestAiMessage(messages)
                if (hasToolCalls(latestAiMessage)) {
                    return {
                        threadGoalStatus: goal.status as ThreadGoalStatus
                    }
                }

                const tokenUsage = getAIMessageTokenUsage(latestAiMessage)
                const turnStartedAt = readFiniteNumber(state, 'threadGoalTurnStartedAt')
                const elapsedSeconds = turnStartedAt ? Math.max(0, Math.ceil((Date.now() - turnStartedAt) / 1000)) : 0
                const usageGoal =
                    tokenUsage || elapsedSeconds
                        ? await goalService.addUsage(conversationId, {
                              totalTokens: tokenUsage?.totalTokens,
                              elapsedSeconds
                          })
                        : goal
                if (usageGoal && usageGoal !== goal) {
                    await dispatchGoalUpdated(usageGoal)
                }

                const continuationCount = readFiniteNumber(state, 'threadGoalContinuationCount') ?? 0
                if (continuationCount >= config.maxIterations) {
                    const budgetGoal = await goalService.markBudgetLimited(conversationId)
                    await dispatchGoalUpdated(budgetGoal)
                    return {
                        threadGoalContinuationCount: continuationCount,
                        threadGoalStatus: 'budget_limited'
                    }
                }

                await goalService.incrementContinuation(conversationId)
                return {
                    messages: [createContinuationMessage()],
                    threadGoalContinuationCount: continuationCount + 1,
                    threadGoalStatus: 'active',
                    threadGoalTurnStartedAt: Date.now(),
                    jumpTo: 'model'
                }
            }
        }
    }
}
