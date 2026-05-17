const mockInterrupt = jest.fn()

jest.mock('@langchain/langgraph', () => {
    const actual = jest.requireActual('@langchain/langgraph')
    return {
        ...actual,
        interrupt: (...args: unknown[]) => mockInterrupt(...args)
    }
})

jest.mock('@xpert-ai/plugin-sdk', () => {
    const actual = jest.requireActual('@xpert-ai/plugin-sdk')
    return {
        ...actual,
        AgentMiddlewareStrategy: () => (target: unknown) => target
    }
})

import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages'
import { HumanInTheLoopMiddleware } from './human-in-the-loop.middleware'

describe('HumanInTheLoopMiddleware', () => {
    beforeEach(() => {
        mockInterrupt.mockReset()
    })

    it('keeps approved tool calls pending when another reviewed call is rejected', async () => {
        mockInterrupt.mockResolvedValue({
            decisions: [
                {
                    type: 'reject',
                    message: 'keep this one'
                },
                {
                    type: 'approve'
                }
            ]
        })

        const strategy = new HumanInTheLoopMiddleware()
        const middleware = await Promise.resolve(
            strategy.createMiddleware(
                {
                    interruptOn: {
                        deleteSkill: {
                            allowedDecisions: ['approve', 'reject']
                        }
                    }
                },
                {} as any
            )
        )
        const aiMessage = new AIMessage({
            id: 'ai-1',
            content: '',
            tool_calls: [
                {
                    type: 'tool_call',
                    id: 'call-rejected',
                    name: 'deleteSkill',
                    args: {
                        skillName: 'keep-skill'
                    }
                },
                {
                    type: 'tool_call',
                    id: 'call-approved',
                    name: 'deleteSkill',
                    args: {
                        skillName: 'remove-skill'
                    }
                }
            ]
        })

        const result = await (middleware.afterModel as any).hook(
            {
                messages: [new HumanMessage('delete skills'), aiMessage]
            },
            {}
        )

        expect((result.messages[0] as AIMessage).tool_calls?.map((toolCall) => toolCall.id)).toEqual([
            'call-rejected',
            'call-approved'
        ])
        expect(result.messages[1]).toBeInstanceOf(ToolMessage)
        expect((result.messages[1] as ToolMessage).tool_call_id).toBe('call-rejected')
        expect((result.messages[1] as ToolMessage).content).toBe('keep this one')
        expect(result.jumpTo).toBeUndefined()
    })

    it('jumps back to the model when every reviewed call already has a rejection response', async () => {
        mockInterrupt.mockResolvedValue({
            decisions: [
                {
                    type: 'reject',
                    message: 'do not run this'
                }
            ]
        })

        const strategy = new HumanInTheLoopMiddleware()
        const middleware = await Promise.resolve(
            strategy.createMiddleware(
                {
                    interruptOn: {
                        deleteSkill: true
                    }
                },
                {} as any
            )
        )
        const aiMessage = new AIMessage({
            id: 'ai-1',
            content: '',
            tool_calls: [
                {
                    type: 'tool_call',
                    id: 'call-rejected',
                    name: 'deleteSkill',
                    args: {
                        skillName: 'keep-skill'
                    }
                }
            ]
        })

        const result = await (middleware.afterModel as any).hook(
            {
                messages: [new HumanMessage('delete skills'), aiMessage]
            },
            {}
        )

        expect((result.messages[0] as AIMessage).tool_calls?.map((toolCall) => toolCall.id)).toEqual(['call-rejected'])
        expect((result.messages[1] as ToolMessage).tool_call_id).toBe('call-rejected')
        expect(result.jumpTo).toBe('model')
    })
})
