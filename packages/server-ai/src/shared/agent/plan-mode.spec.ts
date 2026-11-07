import { AIMessage, SystemMessage } from '@langchain/core/messages'
import type { ModelRequest } from '@xpert-ai/plugin-sdk'
import { WorkflowNodeTypeEnum } from '@xpert-ai/contracts'
import { FakeStreamingChatModel } from './fake-streaming-chat-model'
import { hasExplicitPlanModeFlag, isPlanModeEnabledFromState } from './plan-mode'
import { RequestUserInputMiddleware } from '../../xpert-middleware/request-user-input.middleware'
import { ClientToolMiddleware } from '../../xpert-middleware/client-tool.middleware'

function createMiddleware() {
    return new RequestUserInputMiddleware(new ClientToolMiddleware()).createMiddleware(
        {},
        {
            tenantId: 'tenant',
            userId: 'user',
            tools: new Map(),
            runtime: { createModelClient: jest.fn(), wrapWorkflowNodeExecution: jest.fn() },
            node: {
                id: 'input',
                key: 'input',
                type: WorkflowNodeTypeEnum.MIDDLEWARE,
                provider: 'RequestUserInputMiddleware'
            }
        }
    )
}

describe('plan mode middleware helpers', () => {
    it('detects plan mode from human state', () => {
        expect(
            isPlanModeEnabledFromState({
                human: {
                    input: 'Plan this',
                    planMode: true
                }
            })
        ).toBe(true)
        expect(hasExplicitPlanModeFlag({ human: { planMode: false } })).toBe(true)
        expect(isPlanModeEnabledFromState({ human: { planMode: false } })).toBe(false)
        expect(hasExplicitPlanModeFlag({ human: { input: 'Plan this' } })).toBe(false)
    })

    it('retains the Plan Mode approval protocol when the question tool is available', async () => {
        const middleware = await createMiddleware()
        const handler = jest.fn(async (request: ModelRequest) => {
            void request
            return new AIMessage('plan')
        })
        await middleware.wrapModelCall!(
            {
                model: new FakeStreamingChatModel({}),
                messages: [],
                tools: middleware.tools!,
                systemMessage: new SystemMessage('base'),
                state: { messages: [], human: { planMode: true } },
                runtime: {}
            },
            handler
        )

        expect(handler.mock.calls[0][0].systemMessage.content).toContain('write the plan directly as Markdown')
        expect(handler.mock.calls[0][0].systemMessage.content).toContain(
            'Do not wrap the proposed plan in a fenced code block.'
        )
        expect(handler.mock.calls[0][0].systemMessage.content).toContain('strict state machine')
        expect(handler.mock.calls[0][0].systemMessage.content).toContain('at most once before proposing the plan')
        expect(handler.mock.calls[0][0].systemMessage.content).toContain(
            'make conservative assumptions in the proposed plan instead of asking another clarification round'
        )
        expect(handler.mock.calls[0][0].systemMessage.content).toContain('content.purpose "plan_clarification"')
        expect(handler.mock.calls[0][0].systemMessage.content).toContain('They are never approval to implement.')
        expect(handler.mock.calls[0][0].systemMessage.content).toContain(
            'do not call request_user_input for more clarification'
        )
        expect(handler.mock.calls[0][0].systemMessage.content).toContain(
            'same assistant response has already presented the proposed plan'
        )
        expect(handler.mock.calls[0][0].systemMessage.content).toContain(
            'content.purpose "implementation_confirmation"'
        )
        expect(handler.mock.calls[0][0].systemMessage.content).not.toContain('```markdown')
        expect(handler.mock.calls[0][0].systemMessage.content).toContain('Implement this plan?')
        expect(handler.mock.calls[0][0].systemMessage.content).toContain('Yes, implement this plan')
    })

    it('ends after the plan when no question tool is selected', async () => {
        const middleware = await createMiddleware()
        const handler = jest.fn(async (request: ModelRequest) => {
            const content = request.systemMessage?.content
            expect(content).toContain('End the turn after the plan.')
            expect(content).toContain('Do not implement')
            expect(content).not.toContain('implement_plan')
            expect(request.tools).toEqual([])
            return new AIMessage('plan')
        })
        await middleware.wrapModelCall!(
            {
                model: new FakeStreamingChatModel({}),
                messages: [],
                tools: [],
                systemMessage: new SystemMessage('base'),
                state: { messages: [], human: { planMode: true } },
                runtime: {}
            },
            handler
        )
        expect(handler).toHaveBeenCalledTimes(1)
    })
})
