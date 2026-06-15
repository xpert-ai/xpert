import {
    AIMessage,
    BaseMessage,
    HumanMessage,
    MessageContent,
    SystemMessage,
    isAIMessage,
    isToolMessage
} from '@langchain/core/messages'
import { tool } from '@langchain/core/tools'
import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { InferInteropZodInput, interopParse } from '@langchain/core/utils/types'
import {
    ChatMessageEventTypeEnum,
    IThreadGoal,
    STATE_VARIABLE_HUMAN,
    TAgentMiddlewareMeta,
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
    threadGoalPhase: z.enum(['act', 'verify']).optional(),
    threadGoalContinuationCount: z.number().int().min(0).default(0),
    threadGoalVerificationRetryCount: z.number().int().min(0).default(0),
    threadGoalTurnStartedAt: z.number().optional()
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

function readGoalPhase(state: unknown): 'act' | 'verify' {
    if (!state || typeof state !== 'object') {
        return 'act'
    }
    const value = Reflect.get(state, 'threadGoalPhase')
    return value === 'verify' ? 'verify' : 'act'
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
    goalSpec?: IThreadGoal['goalSpec']
    elapsedSeconds?: number
    continuationCount?: number
}): string {
    const goalSpec = goal.goalSpec
    const executableGoal = goalSpec?.executableGoal?.trim()
    const successCriteria = goalSpec?.successCriteria?.length
        ? goalSpec.successCriteria.map((item) => `- ${item}`).join('\n')
        : '- The user objective is complete.'
    const constraints = goalSpec?.constraints?.length
        ? goalSpec.constraints.map((item) => `- ${item}`).join('\n')
        : '- None.'
    const verificationChecklist = goalSpec?.verificationChecklist?.length
        ? goalSpec.verificationChecklist.map((item) => `- ${item}`).join('\n')
        : '- Verify the user objective is complete.'

    return `<goal_context>
status: ${goal.status}
objective: ${goal.objective}
executable_goal: ${executableGoal || goal.objective}
success_criteria:
${successCriteria}
constraints:
${constraints}
verification_checklist:
${verificationChecklist}
usage:
- elapsed_seconds: ${goal.elapsedSeconds ?? 0}
- continuation_count: ${goal.continuationCount ?? 0}
instructions:
- Act toward the executable goal until there is enough evidence to verify it.
- Do not mark the goal complete or blocked from the act phase.
- Use get_goal when you need the latest persisted goal state.
- Do not pause, resume, clear, or replace the goal; those actions are user-controlled.
</goal_context>`
}

function createActMessage(nextAction?: string): HumanMessage {
    const action = nextAction?.trim()
    return new HumanMessage({
        content: action
            ? `Continue working toward the active goal. Next action: ${action}`
            : 'Continue working toward the active goal. Make concrete progress toward the executable goal. Do not mark the goal complete or blocked from this act phase.',
        additional_kwargs: {
            hidden: true,
            internal: true,
            xpertInternalGoalAct: true
        }
    })
}

type GoalEvidence = {
    assistantOutputs: string[]
    toolResults: Array<{
        name: string
        status?: string
        emptyResult?: boolean
        output: string
    }>
    errors: string[]
}

function truncateEvidenceText(text: string, maxLength = 1200): string {
    const normalized = text.trim()
    if (normalized.length <= maxLength) {
        return normalized
    }
    return `${normalized.slice(0, maxLength)}... [truncated]`
}

function tryParseJson(value: string): unknown {
    const trimmed = value.trim()
    if (!trimmed) {
        return undefined
    }
    try {
        return JSON.parse(trimmed) as unknown
    } catch {
        return undefined
    }
}

function isEmptyToolResult(value: unknown): boolean | undefined {
    if (Array.isArray(value)) {
        return value.length === 0
    }
    if (value && typeof value === 'object') {
        const items = Reflect.get(value, 'items')
        if (Array.isArray(items)) {
            return items.length === 0
        }
        const results = Reflect.get(value, 'results')
        if (Array.isArray(results)) {
            return results.length === 0
        }
    }
    return undefined
}

function buildGoalEvidence(messages: BaseMessage[]): GoalEvidence {
    const evidence: GoalEvidence = {
        assistantOutputs: [],
        toolResults: [],
        errors: []
    }

    messages.forEach((message) => {
        if (isToolMessage(message)) {
            const text = getMessageText(message.content)
            const parsed = tryParseJson(text)
            const status =
                typeof Reflect.get(message, 'status') === 'string' ? Reflect.get(message, 'status') : undefined
            const name = typeof Reflect.get(message, 'name') === 'string' ? Reflect.get(message, 'name') : 'tool'
            evidence.toolResults.push({
                name,
                ...(status ? { status } : {}),
                ...(isEmptyToolResult(parsed) !== undefined ? { emptyResult: isEmptyToolResult(parsed) } : {}),
                output: truncateEvidenceText(text)
            })
            return
        }

        if (isAIMessage(message)) {
            const text = getMessageText(message.content)
            if (text) {
                evidence.assistantOutputs.push(truncateEvidenceText(text, 800))
            }
            const error = typeof Reflect.get(message, 'error') === 'string' ? Reflect.get(message, 'error') : ''
            if (error) {
                evidence.errors.push(error)
            }
        }
    })

    return evidence
}

function createVerificationMessage(evidence?: GoalEvidence): HumanMessage {
    const evidenceJson = evidence ? JSON.stringify(evidence, null, 2) : '{}'
    return new HumanMessage({
        content:
            `Verify the active goal against the goal context. Do not do new work.\n` +
            `Return only JSON with this shape: {"outcome":"passed"|"failed"|"blocked","evidence":["..."],"reason":"...","nextAction":"..."}.\n` +
            `Do not wrap the JSON in Markdown. Do not use unescaped double quotes inside string values.\n` +
            `Use "passed" only when concrete tool results, artifacts, or durable outputs satisfy the success criteria.\n` +
            `Assistant summaries or claims are not sufficient evidence by themselves.\n` +
            `If a success criterion requires search/retrieval confirmation and search results are empty, do not treat a direct get/read by id as retrieval success.\n` +
            `Use "failed" when the goal is not complete and there is a concrete next action. Use "blocked" when progress cannot continue without user input or external changes.\n` +
            `<goal_evidence_json>\n${evidenceJson}\n</goal_evidence_json>`,
        additional_kwargs: {
            hidden: true,
            internal: true,
            xpertInternalGoalVerify: true
        }
    })
}

type GoalVerification = {
    outcome: 'passed' | 'failed' | 'blocked'
    evidence: string[]
    reason: string
    nextAction?: string
}

function readStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) {
        return []
    }
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

function readString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : ''
}

function extractGoalVerificationJsonText(text: string): string | null {
    const jsonText = text.startsWith('{') ? text : text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
    if (!jsonText.startsWith('{') || !jsonText.endsWith('}')) {
        return null
    }

    return jsonText
}

function findGoalVerificationValueStart(text: string, field: keyof GoalVerification): number {
    const fieldIndex = text.indexOf(`"${field}"`)
    if (fieldIndex < 0) {
        return -1
    }
    const colonIndex = text.indexOf(':', fieldIndex)
    if (colonIndex < 0) {
        return -1
    }

    let index = colonIndex + 1
    while (index < text.length && /\s/.test(text[index])) {
        index += 1
    }
    return index
}

function findNextGoalVerificationField(text: string, startIndex: number): number {
    const nextField = text.slice(startIndex).search(/\n\s*"(outcome|evidence|reason|nextAction)"\s*:/)
    if (nextField >= 0) {
        return startIndex + nextField
    }

    const objectEnd = text.slice(startIndex).search(/\n\s*}/)
    if (objectEnd >= 0) {
        return startIndex + objectEnd
    }

    return text.length
}

function trimLooseJsonString(value: string): string {
    let text = value.trim()
    if (text.endsWith(',')) {
        text = text.slice(0, -1).trim()
    }
    if (text.startsWith('"')) {
        text = text.slice(1)
    }
    if (text.endsWith('"')) {
        text = text.slice(0, -1)
    }
    return text.replace(/\\"/g, '"').trim()
}

function readLooseStringField(text: string, field: keyof GoalVerification): string {
    const valueStart = findGoalVerificationValueStart(text, field)
    if (valueStart < 0 || text[valueStart] !== '"') {
        return ''
    }

    const valueEnd = findNextGoalVerificationField(text, valueStart + 1)
    return trimLooseJsonString(text.slice(valueStart, valueEnd))
}

function findLooseArrayEnd(text: string, startIndex: number): number {
    const arrayEnd = text.slice(startIndex).search(/\n\s*]\s*,?/)
    return arrayEnd >= 0 ? startIndex + arrayEnd : -1
}

function readLooseStringArrayField(text: string, field: keyof GoalVerification): string[] {
    const valueStart = findGoalVerificationValueStart(text, field)
    if (valueStart < 0 || text[valueStart] !== '[') {
        return []
    }

    const arrayEnd = findLooseArrayEnd(text, valueStart + 1)
    if (arrayEnd < 0) {
        return []
    }

    return text
        .slice(valueStart + 1, arrayEnd)
        .split('\n')
        .map((line) => trimLooseJsonString(line))
        .filter((item) => item.length > 0)
}

function parseLooseGoalVerification(text: string): GoalVerification | null {
    const outcome = readLooseStringField(text, 'outcome')
    if (outcome !== 'passed' && outcome !== 'failed' && outcome !== 'blocked') {
        return null
    }

    const evidence = readLooseStringArrayField(text, 'evidence')
    const reason = readLooseStringField(text, 'reason')
    if (!evidence.length || !reason) {
        return null
    }

    const nextAction = readLooseStringField(text, 'nextAction')
    return {
        outcome,
        evidence,
        reason,
        ...(nextAction ? { nextAction } : {})
    }
}

function parseGoalVerification(content: MessageContent | unknown): GoalVerification | null {
    const text = getMessageText(content).trim()
    if (!text) {
        return null
    }
    const jsonText = extractGoalVerificationJsonText(text)
    if (!jsonText) {
        return null
    }

    let parsed: unknown
    try {
        parsed = JSON.parse(jsonText) as unknown
    } catch {
        return parseLooseGoalVerification(jsonText)
    }
    if (!parsed || typeof parsed !== 'object') {
        return null
    }

    const outcome = Reflect.get(parsed, 'outcome')
    if (outcome !== 'passed' && outcome !== 'failed' && outcome !== 'blocked') {
        return null
    }
    const evidence = readStringArray(Reflect.get(parsed, 'evidence'))
    const reason = readString(Reflect.get(parsed, 'reason'))
    if (!evidence.length || !reason) {
        return null
    }
    const nextAction = readString(Reflect.get(parsed, 'nextAction'))
    return {
        outcome,
        evidence,
        reason,
        ...(nextAction ? { nextAction } : {})
    }
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

                const currentPhase = readGoalPhase(state)
                return {
                    threadGoalId: goal.id,
                    threadGoalObjective: goal.objective,
                    threadGoalStatus: goal.status,
                    threadGoalPhase: isRunnableThreadGoalStatus(goal.status) ? currentPhase : 'act',
                    threadGoalContinuationCount: 0,
                    threadGoalVerificationRetryCount: 0,
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
                ...(readGoalPhase(request.state) === 'verify' ? { tools: [] } : {}),
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
                        threadGoalPhase: readGoalPhase(state),
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

                const phase = readGoalPhase(state)
                if (phase === 'verify') {
                    const verification = parseGoalVerification(latestAiMessage?.content)
                    if (!verification) {
                        const retryCount = readFiniteNumber(state, 'threadGoalVerificationRetryCount') ?? 0
                        if (retryCount < 1) {
                            return {
                                messages: [createVerificationMessage(buildGoalEvidence(messages))],
                                threadGoalPhase: 'verify',
                                threadGoalVerificationRetryCount: retryCount + 1,
                                threadGoalStatus: 'active',
                                jumpTo: 'model'
                            }
                        }
                        const blockedGoal = await goalService.updateGoalFromModel(conversationId, 'blocked')
                        await dispatchGoalUpdated(blockedGoal)
                        return {
                            threadGoalStatus: 'blocked'
                        }
                    }

                    if (verification.outcome === 'passed') {
                        const completeGoal = await goalService.updateGoalFromModel(conversationId, 'complete')
                        await dispatchGoalUpdated(completeGoal)
                        return {
                            threadGoalStatus: 'complete'
                        }
                    }

                    if (verification.outcome === 'blocked' || !verification.nextAction) {
                        const blockedGoal = await goalService.updateGoalFromModel(conversationId, 'blocked')
                        await dispatchGoalUpdated(blockedGoal)
                        return {
                            threadGoalStatus: 'blocked'
                        }
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
                        messages: [createActMessage(verification.nextAction)],
                        threadGoalContinuationCount: continuationCount + 1,
                        threadGoalPhase: 'act',
                        threadGoalVerificationRetryCount: 0,
                        threadGoalStatus: 'active',
                        threadGoalTurnStartedAt: Date.now(),
                        jumpTo: 'model'
                    }
                }

                return {
                    messages: [createVerificationMessage(buildGoalEvidence(messages))],
                    threadGoalContinuationCount: readFiniteNumber(state, 'threadGoalContinuationCount') ?? 0,
                    threadGoalPhase: 'verify',
                    threadGoalVerificationRetryCount: 0,
                    threadGoalStatus: 'active',
                    threadGoalTurnStartedAt: Date.now(),
                    jumpTo: 'model'
                }
            }
        }
    }
}
