import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages'
import { getPendingToolCallsAfterTrailingToolMessages } from './agent-navigation'

describe('getPendingToolCallsAfterTrailingToolMessages', () => {
    it('returns unanswered tool calls from the latest assistant tool-call block', () => {
        const aiMessage = new AIMessage({
            content: '',
            tool_calls: [
                {
                    type: 'tool_call',
                    id: 'call-rejected',
                    name: 'deleteSkill',
                    args: {}
                },
                {
                    type: 'tool_call',
                    id: 'call-approved',
                    name: 'deleteSkill',
                    args: {}
                }
            ]
        })
        const rejection = new ToolMessage({
            content: 'keep it',
            name: 'deleteSkill',
            tool_call_id: 'call-rejected'
        })

        expect(
            getPendingToolCallsAfterTrailingToolMessages([new HumanMessage('delete'), aiMessage, rejection])
        ).toEqual([
            expect.objectContaining({
                id: 'call-approved'
            })
        ])
    })

    it('does not route stale tool calls across a later user message', () => {
        const aiMessage = new AIMessage({
            content: '',
            tool_calls: [
                {
                    type: 'tool_call',
                    id: 'call-1',
                    name: 'deleteSkill',
                    args: {}
                }
            ]
        })

        expect(getPendingToolCallsAfterTrailingToolMessages([aiMessage, new HumanMessage('next turn')])).toEqual([])
    })
})
