jest.mock('@xpert-ai/plugin-sdk', () => {
    const actual = jest.requireActual('@xpert-ai/plugin-sdk')
    return {
        ...actual,
        AgentMiddlewareStrategy: () => (target: unknown) => target
    }
})

jest.mock('@langchain/core/callbacks/dispatch', () => ({
    dispatchCustomEvent: jest.fn().mockResolvedValue(undefined)
}))

import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages'
import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import {
    CHAT_EVENT_TYPE_THREAD_GOAL_UPDATED,
    ChatMessageEventTypeEnum,
    IWFNMiddleware,
    STATE_VARIABLE_HUMAN,
    ThreadGoalStatus,
    WorkflowNodeTypeEnum
} from '@xpert-ai/contracts'
import { AgentMiddleware, AgentMiddlewareRuntimeApi, IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'
import { ChatConversationGoalService } from '../chat-conversation/goal/conversation-goal.service'
import { CONVERSATION_GOAL_CLIENT_ACTION_TYPE } from './conversation-goal.middleware.shared'
import { RALPH_LOOP_MIDDLEWARE_NAME, RalphLoopMiddleware } from './ralph-loop.middleware'

type GoalRecord = {
    id: string
    conversationId: string
    threadId: string
    objective: string
    goalSpec?: {
        originalObjective: string
        executableGoal: string
        successCriteria: string[]
        constraints: string[]
        verificationChecklist: string[]
        recommendedStrategy: string
        source: string
        generatedAt: string
    }
    status: ThreadGoalStatus
    tokensUsed: number
    elapsedSeconds: number
    continuationCount: number
}

function createRuntime(): AgentMiddlewareRuntimeApi {
    return {
        async createModelClient() {
            throw new Error('createModelClient is not used in these tests.')
        },
        async wrapWorkflowNodeExecution(run, params) {
            void params
            return (await run({})).state
        }
    }
}

function createContext(overrides: Partial<IAgentMiddlewareContext> = {}): IAgentMiddlewareContext {
    const node: IWFNMiddleware = {
        id: 'middleware-1',
        key: 'middleware-1',
        type: WorkflowNodeTypeEnum.MIDDLEWARE,
        provider: RALPH_LOOP_MIDDLEWARE_NAME
    }

    return {
        tenantId: 'tenant-1',
        userId: 'user-1',
        agentKey: 'agent-1',
        conversationId: 'conversation-1',
        node,
        tools: new Map(),
        runtime: createRuntime(),
        ...overrides
    }
}

type GoalServiceMock = {
    getByConversationId: jest.Mock<Promise<GoalRecord | null>, [string]>
    updateGoalFromModel: jest.Mock<Promise<GoalRecord>, [string, ThreadGoalStatus]>
    addUsage: jest.Mock<Promise<GoalRecord | null>, [string, { totalTokens?: number; elapsedSeconds?: number }]>
    incrementContinuation: jest.Mock<Promise<GoalRecord | null>, [string]>
    markBudgetLimited: jest.Mock<Promise<GoalRecord | null>, [string]>
}

function createGoalService(initialGoal?: GoalRecord | null): GoalServiceMock {
    let goal = initialGoal ?? null

    return {
        getByConversationId: jest.fn(async (_conversationId: string) => goal),
        updateGoalFromModel: jest.fn(async (_conversationId, status) => {
            if (!goal) {
                throw new Error('Conversation has no goal.')
            }
            goal = {
                ...goal,
                status
            }
            return goal
        }),
        addUsage: jest.fn(async (_conversationId, usage) => {
            if (!goal) {
                return null
            }
            goal = {
                ...goal,
                tokensUsed: goal.tokensUsed + (usage.totalTokens ?? 0),
                elapsedSeconds: goal.elapsedSeconds + (usage.elapsedSeconds ?? 0)
            }
            return goal
        }),
        incrementContinuation: jest.fn(async (_conversationId) => {
            if (!goal) {
                return null
            }
            goal = {
                ...goal,
                continuationCount: goal.continuationCount + 1
            }
            return goal
        }),
        markBudgetLimited: jest.fn(async (_conversationId) => {
            if (!goal) {
                return null
            }
            goal = {
                ...goal,
                status: 'budget_limited'
            }
            return goal
        })
    }
}

async function createRalphLoopAgentMiddleware(goalService = createGoalService()) {
    const strategy = new RalphLoopMiddleware(goalService as unknown as ChatConversationGoalService)
    return Promise.resolve(strategy.createMiddleware({}, createContext()))
}

type MiddlewareResultSnapshot = {
    messages?: Array<{ content?: unknown }>
    threadGoalContinuationCount?: number
    threadGoalPhase?: string
    threadGoalVerificationRetryCount?: number
    threadGoalStatus?: string
    jumpTo?: string
}

function getBeforeAgentHook(middleware: AgentMiddleware) {
    const hook = typeof middleware.beforeAgent === 'function' ? middleware.beforeAgent : middleware.beforeAgent?.hook
    if (!hook) {
        throw new Error('Expected middleware to expose beforeAgent.')
    }

    return hook
}

function getAfterModelHook(middleware: AgentMiddleware) {
    const hook = typeof middleware.afterModel === 'function' ? middleware.afterModel : middleware.afterModel?.hook
    if (!hook) {
        throw new Error('Expected middleware to expose afterModel.')
    }

    return hook
}

function getWrapModelCall(middleware: AgentMiddleware) {
    if (!middleware.wrapModelCall) {
        throw new Error('Expected middleware to expose wrapModelCall.')
    }

    return middleware.wrapModelCall
}

const activeGoal: GoalRecord = {
    id: 'goal-1',
    conversationId: 'conversation-1',
    threadId: 'thread-1',
    objective: 'ship the feature',
    status: 'active',
    tokensUsed: 120,
    elapsedSeconds: 5,
    continuationCount: 0
}

const activeGoalWithSpec: GoalRecord = {
    ...activeGoal,
    goalSpec: {
        originalObjective: 'ship the feature',
        executableGoal: 'Finish and verify the feature implementation.',
        successCriteria: ['The feature is implemented.', 'Relevant verification passes.'],
        constraints: ['Do not change unrelated behavior.'],
        verificationChecklist: ['Confirm implementation exists.', 'Confirm verification evidence exists.'],
        recommendedStrategy: 'act_then_verify',
        source: 'llm',
        generatedAt: '2026-06-11T00:00:00.000Z'
    }
}

describe('RalphLoopMiddleware', () => {
    beforeEach(() => {
        jest.clearAllMocks()
    })

    it('exposes /goal as a client action instead of a raw chat invocation', () => {
        const strategy = new RalphLoopMiddleware(createGoalService() as unknown as ChatConversationGoalService)

        expect(strategy.meta.name).toBe(RALPH_LOOP_MIDDLEWARE_NAME)
        expect(strategy.meta.slashCommands).toEqual([
            expect.objectContaining({
                name: 'goal',
                label: 'Goal',
                action: {
                    type: 'client_action',
                    action: {
                        type: CONVERSATION_GOAL_CLIENT_ACTION_TYPE
                    }
                }
            })
        ])
        expect(JSON.stringify(strategy.meta)).not.toContain('verifier-first')
        expect(JSON.stringify(strategy.meta)).not.toContain('<promise>DONE</promise>')
    })

    it('exposes only the read goal tool to the model', async () => {
        const goalService = createGoalService(activeGoal)
        const strategy = new RalphLoopMiddleware(goalService as unknown as ChatConversationGoalService)
        const middleware = await Promise.resolve(strategy.createMiddleware({}, createContext()))
        const toolNames = middleware.tools?.map((tool) => tool.name)

        expect(toolNames).toEqual(['get_goal'])
        expect(toolNames).not.toContain('create_goal')
        expect(toolNames).not.toContain('update_goal')
    })

    it('injects hidden goal context for active goals', async () => {
        const middleware = await createRalphLoopAgentMiddleware(createGoalService(activeGoal))
        const wrapModelCall = getWrapModelCall(middleware)
        const handler = jest.fn(async (request: { systemMessage: SystemMessage }) => {
            void request
            return new AIMessage('ok')
        })

        await wrapModelCall(
            {
                messages: [new HumanMessage('continue')],
                systemMessage: new SystemMessage('You are helpful.'),
                state: {},
                tools: [],
                runtime: {}
            } as never,
            handler as never
        )

        const request = handler.mock.calls[0]?.[0]
        if (!request) {
            throw new Error('Expected wrapModelCall handler request.')
        }
        expect(String(request.systemMessage.content)).toContain('<goal_context>')
        expect(String(request.systemMessage.content)).toContain('ship the feature')
        expect(String(request.systemMessage.content)).not.toContain('token_budget')
        expect(String(request.systemMessage.content)).toContain('get_goal')
        expect(String(request.systemMessage.content)).not.toContain('update_goal')
    })

    it('injects GoalSpec details when available', async () => {
        const middleware = await createRalphLoopAgentMiddleware(createGoalService(activeGoalWithSpec))
        const wrapModelCall = getWrapModelCall(middleware)
        const handler = jest.fn(async (request: { systemMessage: SystemMessage }) => {
            void request
            return new AIMessage('ok')
        })

        await wrapModelCall(
            {
                messages: [new HumanMessage('continue')],
                systemMessage: new SystemMessage('You are helpful.'),
                state: {},
                tools: [],
                runtime: {}
            } as never,
            handler as never
        )

        const request = handler.mock.calls[0]?.[0]
        if (!request) {
            throw new Error('Expected wrapModelCall handler request.')
        }
        expect(String(request.systemMessage.content)).toContain('Finish and verify the feature implementation.')
        expect(String(request.systemMessage.content)).toContain('Confirm verification evidence exists.')
    })

    it('does not inject or continue when the goal is paused or the run is in plan mode', async () => {
        const pausedGoal = {
            ...activeGoal,
            status: 'paused' as const
        }
        const middleware = await createRalphLoopAgentMiddleware(createGoalService(pausedGoal))
        const beforeAgent = getBeforeAgentHook(middleware)
        const afterModel = getAfterModelHook(middleware)

        await expect(beforeAgent({ messages: [] }, {})).resolves.toMatchObject({
            threadGoalContinuationCount: 0,
            threadGoalStatus: 'paused'
        })
        await expect(
            afterModel(
                {
                    messages: [new HumanMessage('continue'), new AIMessage('still working')],
                    [STATE_VARIABLE_HUMAN]: { planMode: true }
                },
                {}
            )
        ).resolves.toBeUndefined()
    })

    it('moves from act to verify when active goals have no pending tool calls', async () => {
        const goalService = createGoalService(activeGoal)
        const middleware = await createRalphLoopAgentMiddleware(goalService)
        const afterModel = getAfterModelHook(middleware)
        const result = await afterModel(
            {
                messages: [new HumanMessage('start'), new AIMessage('progress')],
                threadGoalContinuationCount: 0,
                threadGoalTurnStartedAt: Date.now() - 1000
            },
            {}
        )
        const snapshot = result as MiddlewareResultSnapshot

        expect(snapshot).toMatchObject({
            threadGoalPhase: 'verify',
            threadGoalStatus: 'active',
            jumpTo: 'model'
        })
        expect(snapshot.messages?.[0]).toBeInstanceOf(HumanMessage)
        expect(String(snapshot.messages?.[0]?.content)).toContain('Verify the active goal')
        expect(goalService.incrementContinuation).not.toHaveBeenCalled()
        expect(dispatchCustomEvent).toHaveBeenCalledWith(
            ChatMessageEventTypeEnum.ON_CHAT_EVENT,
            expect.objectContaining({
                type: CHAT_EVENT_TYPE_THREAD_GOAL_UPDATED,
                goal: expect.objectContaining({ elapsedSeconds: expect.any(Number) })
            })
        )
    })

    it('includes structured tool evidence in the verification request', async () => {
        const goalService = createGoalService(activeGoalWithSpec)
        const middleware = await createRalphLoopAgentMiddleware(goalService)
        const afterModel = getAfterModelHook(middleware)
        const result = await afterModel(
            {
                messages: [
                    new HumanMessage('continue'),
                    new AIMessage('I wrote the memory and confirmed it.'),
                    new ToolMessage({
                        name: 'memory_search',
                        content: '[]',
                        tool_call_id: 'search-1'
                    }),
                    new ToolMessage({
                        name: 'memory_get',
                        content: JSON.stringify({ memoryId: 'mem-1', body: 'stored preference' }),
                        tool_call_id: 'get-1'
                    }),
                    new AIMessage('All conditions are done.')
                ],
                threadGoalContinuationCount: 0
            },
            {}
        )
        const snapshot = result as MiddlewareResultSnapshot
        const verificationPrompt = String(snapshot.messages?.[0]?.content)

        expect(verificationPrompt).toContain('<goal_evidence_json>')
        expect(verificationPrompt).toContain('"name": "memory_search"')
        expect(verificationPrompt).toContain('"emptyResult": true')
        expect(verificationPrompt).toContain('"name": "memory_get"')
        expect(verificationPrompt).toContain('Assistant summaries or claims are not sufficient evidence')
        expect(verificationPrompt).toContain('do not treat a direct get/read by id as retrieval success')
    })

    it('converts a passed verification into a complete goal', async () => {
        const goalService = createGoalService(activeGoalWithSpec)
        const middleware = await createRalphLoopAgentMiddleware(goalService)
        const afterModel = getAfterModelHook(middleware)
        const result = await afterModel(
            {
                messages: [
                    new HumanMessage('verify'),
                    new AIMessage(
                        JSON.stringify({
                            outcome: 'passed',
                            evidence: ['Implementation exists.', 'Verification evidence exists.'],
                            reason: 'The saved success criteria are satisfied.'
                        })
                    )
                ],
                threadGoalPhase: 'verify',
                threadGoalContinuationCount: 0
            },
            {}
        )
        const snapshot = result as MiddlewareResultSnapshot

        expect(snapshot).toMatchObject({
            threadGoalStatus: 'complete'
        })
        expect(snapshot.jumpTo).toBeUndefined()
        expect(goalService.updateGoalFromModel).toHaveBeenCalledWith('conversation-1', 'complete')
        expect(dispatchCustomEvent).toHaveBeenCalledWith(
            ChatMessageEventTypeEnum.ON_CHAT_EVENT,
            expect.objectContaining({
                type: CHAT_EVENT_TYPE_THREAD_GOAL_UPDATED,
                goal: expect.objectContaining({ status: 'complete' })
            })
        )
    })

    it('converts a passed verification with unescaped evidence quotes into a complete goal', async () => {
        const goalService = createGoalService(activeGoalWithSpec)
        const middleware = await createRalphLoopAgentMiddleware(goalService)
        const afterModel = getAfterModelHook(middleware)
        const result = await afterModel(
            {
                messages: [
                    new HumanMessage('verify'),
                    new AIMessage(`{
  "outcome": "passed",
  "evidence": [
    "create_workspace_skill 返回 success，技能名称"请假申请整理助手"，包路径 skill-2，状态 applied",
    "read_skill_file 成功读取 SKILL.md 完整内容，确认输出格式包含 6 项字段"
  ],
  "reason": "工作区技能"请假申请整理助手"已成功创建，SKILL.md 已通过 read_skill_file 读取确认。",
  "nextAction": "none"
}`)
                ],
                threadGoalPhase: 'verify',
                threadGoalContinuationCount: 0
            },
            {}
        )
        const snapshot = result as MiddlewareResultSnapshot

        expect(snapshot).toMatchObject({
            threadGoalStatus: 'complete'
        })
        expect(snapshot.jumpTo).toBeUndefined()
        expect(goalService.updateGoalFromModel).toHaveBeenCalledWith('conversation-1', 'complete')
    })

    it('preserves a pending verify phase across the next agent entry', async () => {
        const goalService = createGoalService(activeGoalWithSpec)
        const middleware = await createRalphLoopAgentMiddleware(goalService)
        const beforeAgent = getBeforeAgentHook(middleware)
        const afterModel = getAfterModelHook(middleware)

        const resumedState = await beforeAgent(
            {
                messages: [new HumanMessage('Continue working toward the active goal.')],
                threadGoalPhase: 'verify',
                threadGoalStatus: 'active',
                threadGoalContinuationCount: 0
            },
            {}
        )
        expect(resumedState).toMatchObject({
            threadGoalPhase: 'verify',
            threadGoalStatus: 'active'
        })

        const result = await afterModel(
            {
                messages: [
                    new HumanMessage('Continue working toward the active goal.'),
                    new AIMessage(
                        JSON.stringify({
                            outcome: 'passed',
                            evidence: ['The pending verification evidence satisfies the checklist.'],
                            reason: 'The verifier completed after the previous act phase.'
                        })
                    )
                ],
                ...(resumedState as Record<string, unknown>)
            },
            {}
        )

        expect(result as MiddlewareResultSnapshot).toMatchObject({
            threadGoalStatus: 'complete'
        })
        expect(goalService.updateGoalFromModel).toHaveBeenCalledWith('conversation-1', 'complete')
    })

    it('loops from failed verification with a next action back to act', async () => {
        const goalService = createGoalService(activeGoalWithSpec)
        const middleware = await createRalphLoopAgentMiddleware(goalService)
        const afterModel = getAfterModelHook(middleware)
        const result = await afterModel(
            {
                messages: [
                    new HumanMessage('verify'),
                    new AIMessage(
                        JSON.stringify({
                            outcome: 'failed',
                            evidence: ['Verification evidence is missing.'],
                            reason: 'The checklist is not satisfied yet.',
                            nextAction: 'Collect verification evidence.'
                        })
                    )
                ],
                threadGoalPhase: 'verify',
                threadGoalContinuationCount: 0
            },
            {}
        )
        const snapshot = result as MiddlewareResultSnapshot

        expect(snapshot).toMatchObject({
            threadGoalContinuationCount: 1,
            threadGoalPhase: 'act',
            threadGoalStatus: 'active',
            jumpTo: 'model'
        })
        expect(String(snapshot.messages?.[0]?.content)).toContain('Collect verification evidence.')
        expect(goalService.incrementContinuation).toHaveBeenCalledWith('conversation-1')
        expect(goalService.updateGoalFromModel).not.toHaveBeenCalled()
    })

    it('converts failed verification without a next action into a blocked goal', async () => {
        const goalService = createGoalService(activeGoalWithSpec)
        const middleware = await createRalphLoopAgentMiddleware(goalService)
        const afterModel = getAfterModelHook(middleware)
        const result = await afterModel(
            {
                messages: [
                    new HumanMessage('verify'),
                    new AIMessage(
                        JSON.stringify({
                            outcome: 'failed',
                            evidence: ['No next action is available.'],
                            reason: 'The verifier cannot identify concrete progress.'
                        })
                    )
                ],
                threadGoalPhase: 'verify',
                threadGoalContinuationCount: 0
            },
            {}
        )
        const snapshot = result as MiddlewareResultSnapshot

        expect(snapshot).toMatchObject({
            threadGoalStatus: 'blocked'
        })
        expect(snapshot.jumpTo).toBeUndefined()
        expect(goalService.updateGoalFromModel).toHaveBeenCalledWith('conversation-1', 'blocked')
    })

    it('retries invalid verification once before blocking', async () => {
        const goalService = createGoalService(activeGoalWithSpec)
        const middleware = await createRalphLoopAgentMiddleware(goalService)
        const afterModel = getAfterModelHook(middleware)

        const retryResult = await afterModel(
            {
                messages: [new HumanMessage('verify'), new AIMessage('not json')],
                threadGoalPhase: 'verify',
                threadGoalContinuationCount: 0,
                threadGoalVerificationRetryCount: 0
            },
            {}
        )
        expect(retryResult as MiddlewareResultSnapshot).toMatchObject({
            threadGoalPhase: 'verify',
            threadGoalVerificationRetryCount: 1,
            threadGoalStatus: 'active',
            jumpTo: 'model'
        })

        const blockedResult = await afterModel(
            {
                messages: [new HumanMessage('verify'), new AIMessage('still not json')],
                threadGoalPhase: 'verify',
                threadGoalContinuationCount: 0,
                threadGoalVerificationRetryCount: 1
            },
            {}
        )
        expect(blockedResult as MiddlewareResultSnapshot).toMatchObject({
            threadGoalStatus: 'blocked'
        })
        expect(goalService.updateGoalFromModel).toHaveBeenCalledWith('conversation-1', 'blocked')
    })

    it('still verifies act output when max iterations are reached', async () => {
        const goalService = createGoalService(activeGoal)
        const strategy = new RalphLoopMiddleware(goalService as unknown as ChatConversationGoalService)
        const middleware = await Promise.resolve(strategy.createMiddleware({ maxIterations: 2 }, createContext()))
        const afterModel = getAfterModelHook(middleware)

        const result = await afterModel(
            {
                messages: [new HumanMessage('start'), new AIMessage('still active')],
                threadGoalContinuationCount: 2
            },
            {}
        )
        const snapshot = result as MiddlewareResultSnapshot

        expect(snapshot).toMatchObject({
            threadGoalPhase: 'verify',
            threadGoalStatus: 'active',
            jumpTo: 'model'
        })
        expect(goalService.markBudgetLimited).not.toHaveBeenCalled()
    })

    it('stops and marks budget_limited when verify needs another act after max iterations', async () => {
        const goalService = createGoalService(activeGoal)
        const strategy = new RalphLoopMiddleware(goalService as unknown as ChatConversationGoalService)
        const middleware = await Promise.resolve(strategy.createMiddleware({ maxIterations: 2 }, createContext()))
        const afterModel = getAfterModelHook(middleware)

        const result = await afterModel(
            {
                messages: [
                    new HumanMessage('verify'),
                    new AIMessage(
                        JSON.stringify({
                            outcome: 'failed',
                            evidence: ['More work is still required.'],
                            reason: 'The goal is not complete.',
                            nextAction: 'Continue implementation.'
                        })
                    )
                ],
                threadGoalPhase: 'verify',
                threadGoalContinuationCount: 2
            },
            {}
        )
        const snapshot = result as MiddlewareResultSnapshot

        expect(snapshot).toMatchObject({
            threadGoalStatus: 'budget_limited'
        })
        expect(snapshot.jumpTo).toBeUndefined()
        expect(goalService.markBudgetLimited).toHaveBeenCalledWith('conversation-1')
        expect(goalService.incrementContinuation).not.toHaveBeenCalled()
    })
})
