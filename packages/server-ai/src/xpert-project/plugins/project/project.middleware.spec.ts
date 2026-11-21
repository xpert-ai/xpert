import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages'
import { DiscoveryModule } from '@nestjs/core'
import { Test } from '@nestjs/testing'
import { WorkflowNodeTypeEnum } from '@xpert-ai/contracts'
import { AgentMiddlewareRegistry, StrategyBus, type IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'
import { PROJECT_MIDDLEWARE, ProjectMiddleware } from './project.middleware'
import { CONVERSATION_TURN, type ConversationMiddlewareContext } from '../../../chat-conversation/conversation-turn'
import { ProjectSelectionService } from '../../services/project-selection-request'

describe('ProjectMiddleware', () => {
    const requestProjectSelection = jest.fn()
    const strategy = new ProjectMiddleware({ request: requestProjectSelection })
    const context: IAgentMiddlewareContext & ConversationMiddlewareContext = {
        [CONVERSATION_TURN]: {
            conversationId: 'conversation',
            threadId: 'thread',
            executionId: 'execution',
            userId: 'user',
            tenantId: 'tenant',
            isStart: true
        },
        tenantId: 'tenant',
        userId: 'user',
        tools: new Map(),
        node: { id: 'projects', key: 'projects', type: WorkflowNodeTypeEnum.MIDDLEWARE, provider: PROJECT_MIDDLEWARE },
        runtime: { createModelClient: jest.fn(), wrapWorkflowNodeExecution: jest.fn() }
    }
    beforeEach(() => jest.clearAllMocks())

    it('is discovered through the ordinary middleware registry', async () => {
        const module = await Test.createTestingModule({
            imports: [DiscoveryModule],
            providers: [
                StrategyBus,
                AgentMiddlewareRegistry,
                ProjectMiddleware,
                { provide: ProjectSelectionService, useValue: { request: requestProjectSelection } }
            ]
        }).compile()
        await module.init()
        expect(module.get(AgentMiddlewareRegistry).get(PROJECT_MIDDLEWARE)).toBe(module.get(ProjectMiddleware))
        await module.close()
    })

    it('offers only project selection, without task or CRUD tools, and hides it after a project is bound', () => {
        expect(strategy.getToolNames()).toEqual(['request_project_selection'])
        expect(strategy.createMiddleware({}, context).tools.map((tool) => tool.name)).toEqual([
            'request_project_selection'
        ])
        expect(strategy.createMiddleware({}, { ...context, projectId: 'chosen' }).tools).toEqual([])
    })

    it('calls the injected project service with a captured host turn without requiring a RuntimeCapability', async () => {
        const turn = { ...context[CONVERSATION_TURN] }
        const expected = structuredClone(turn)
        const middleware = strategy.createMiddleware({}, { ...context, [CONVERSATION_TURN]: turn })
        turn.userId = 'changed'
        turn.threadId = 'changed'
        const picker = middleware.tools[0]
        if (!('invoke' in picker)) throw new Error('Selection tool missing')
        await picker.invoke({})
        expect(requestProjectSelection).toHaveBeenCalledWith(expected)
    })

    it('does not request a project for discussion and isolates the selection from sibling tool calls', async () => {
        const middleware = strategy.createMiddleware({}, context)
        const request = {
            messages: [new HumanMessage('Discuss metrics')],
            tools: middleware.tools,
            systemMessage: new SystemMessage('Help the user'),
            state: {},
            model: null,
            runtime: {}
        }
        const next = jest.fn().mockResolvedValue(new AIMessage('Group sales by region'))
        await middleware.wrapModelCall(request, next)
        expect(requestProjectSelection).not.toHaveBeenCalled()
        next.mockResolvedValue(
            new AIMessage({
                content: '',
                tool_calls: [
                    { id: 'pick', name: 'request_project_selection', args: {} },
                    { id: 'work', name: 'dashboard_save', args: {} }
                ]
            })
        )
        const result = await middleware.wrapModelCall(request, next)
        expect(result.tool_calls.map((call) => call.name)).toEqual(['request_project_selection'])
    })

    it('ends the turn after a successful selection request but lets the model handle a failed request', async () => {
        const middleware = strategy.createMiddleware({}, context)
        const next = jest.fn().mockResolvedValue(new AIMessage('Please retry'))
        const request = {
            messages: [
                new ToolMessage({
                    name: 'request_project_selection',
                    tool_call_id: 'pick',
                    content: 'PROJECT_SELECTION_REQUESTED'
                })
            ],
            tools: middleware.tools,
            state: {},
            model: null,
            runtime: {}
        }
        const result = await middleware.wrapModelCall(request, next)
        expect(result.tool_calls ?? []).toEqual([])
        expect(next).not.toHaveBeenCalled()
        await middleware.wrapModelCall(
            {
                ...request,
                messages: [
                    new ToolMessage({
                        name: 'request_project_selection',
                        tool_call_id: 'pick',
                        content: 'PROJECT_SELECTION_REQUESTED',
                        status: 'error'
                    })
                ]
            },
            next
        )
        expect(next).toHaveBeenCalledTimes(1)
    })

    it('does not expose project selection in Plan Mode or without a host conversation turn', async () => {
        expect(strategy.createMiddleware({}, { ...context, [CONVERSATION_TURN]: undefined }).tools).toEqual([])
        const middleware = strategy.createMiddleware({}, context)
        const next = jest.fn().mockResolvedValue(new AIMessage('Plan only'))
        await middleware.wrapModelCall(
            { messages: [], tools: middleware.tools, model: null, runtime: {}, state: { human: { planMode: true } } },
            next
        )
        expect(next.mock.calls[0][0].tools).toEqual([])
        expect(requestProjectSelection).not.toHaveBeenCalled()
    })
})
