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

import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages'
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
    createGoalFromModel: jest.Mock<Promise<GoalRecord>, [string, string]>
    updateGoalFromModel: jest.Mock<Promise<GoalRecord>, [string, ThreadGoalStatus]>
    addUsage: jest.Mock<Promise<GoalRecord | null>, [string, { totalTokens?: number; elapsedSeconds?: number }]>
    incrementContinuation: jest.Mock<Promise<GoalRecord | null>, [string]>
    markBudgetLimited: jest.Mock<Promise<GoalRecord | null>, [string]>
}

function createGoalService(initialGoal?: GoalRecord | null): GoalServiceMock {
    let goal = initialGoal ?? null

    return {
        getByConversationId: jest.fn(async (_conversationId: string) => goal),
        createGoalFromModel: jest.fn(async (conversationId, objective) => {
            if (goal) {
                throw new Error('Conversation already has a goal.')
            }
            goal = {
                id: 'goal-created',
                conversationId,
                threadId: 'thread-1',
                objective,
                status: 'active',
                tokensUsed: 0,
                elapsedSeconds: 0,
                continuationCount: 0
            }
            return goal
        }),
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

    it('exposes goal tools and rejects non-terminal model updates', async () => {
        const goalService = createGoalService()
        const strategy = new RalphLoopMiddleware(goalService as unknown as ChatConversationGoalService)
        const middleware = await Promise.resolve(strategy.createMiddleware({}, createContext()))
        const toolNames = middleware.tools?.map((tool) => tool.name)

        expect(toolNames).toEqual(['get_goal', 'create_goal', 'update_goal'])

        const createTool = middleware.tools?.find((tool) => tool.name === 'create_goal')
        const updateTool = middleware.tools?.find((tool) => tool.name === 'update_goal')
        if (!createTool || !updateTool) {
            throw new Error('Expected goal tools.')
        }

        await expect(createTool.invoke({ objective: 'finish docs' })).resolves.toMatchObject({
            objective: 'finish docs',
            status: 'active'
        })
        await expect(updateTool.invoke({ status: 'paused' })).rejects.toThrow('complete or blocked')
        await expect(updateTool.invoke({ status: 'complete' })).resolves.toMatchObject({
            status: 'complete'
        })
        expect(dispatchCustomEvent).toHaveBeenCalledWith(
            ChatMessageEventTypeEnum.ON_CHAT_EVENT,
            expect.objectContaining({
                type: CHAT_EVENT_TYPE_THREAD_GOAL_UPDATED,
                goal: expect.objectContaining({ status: 'complete' })
            })
        )
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

    it('automatically continues active goals without tool calls', async () => {
        const middleware = await createRalphLoopAgentMiddleware(createGoalService(activeGoal))
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
            threadGoalContinuationCount: 1,
            threadGoalStatus: 'active',
            jumpTo: 'model'
        })
        expect(snapshot.messages?.[0]).toBeInstanceOf(HumanMessage)
        expect(String(snapshot.messages?.[0]?.content)).toContain('Continue working toward the active goal')
        expect(dispatchCustomEvent).toHaveBeenCalledWith(
            ChatMessageEventTypeEnum.ON_CHAT_EVENT,
            expect.objectContaining({
                type: CHAT_EVENT_TYPE_THREAD_GOAL_UPDATED,
                goal: expect.objectContaining({ elapsedSeconds: expect.any(Number) })
            })
        )
    })

    it('stops and marks budget_limited when max iterations are reached', async () => {
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
            threadGoalStatus: 'budget_limited'
        })
        expect(snapshot.jumpTo).toBeUndefined()
        expect(goalService.markBudgetLimited).toHaveBeenCalledWith('conversation-1')
    })
})
