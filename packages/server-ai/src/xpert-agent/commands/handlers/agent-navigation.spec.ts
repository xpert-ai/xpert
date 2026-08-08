import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages'
import { buildAgentDecisionPathMap, getPendingToolCallsAfterTrailingToolMessages } from './agent-navigation'

describe('buildAgentDecisionPathMap', () => {
    it('declares middleware tool nodes as valid Send targets', () => {
        expect(
            buildAgentDecisionPathMap(['after_agent', '__end__'], 'before_model', [
                'bom_auto_quick_quotation_list_catalog',
                'bom_auto_quick_quotation_create_project'
            ])
        ).toEqual([
            'after_agent',
            '__end__',
            'before_model',
            'bom_auto_quick_quotation_list_catalog',
            'bom_auto_quick_quotation_create_project'
        ])
    })

    it('deduplicates destinations while preserving their first-seen order', () => {
        expect(buildAgentDecisionPathMap(['before_model'], 'before_model', ['before_model', 'tool_a'])).toEqual([
            'before_model',
            'tool_a'
        ])
    })
})

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
