import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages'
import { Annotation, END, START, StateGraph } from '@langchain/langgraph'
import {
    buildAgentDecisionPathMap,
    getPendingToolCallsAfterTrailingToolMessages,
    routeAgentToolCall
} from './agent-navigation'
import { ToolNode } from './tool_node'

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

describe('unknown tool routing', () => {
    it('routes exact names only and does not alias hyphens or workflow node names', () => {
        const tools = new Set(['bid_retry_role_task']),
            state = { projectId: 'project' }
        for (const name of ['bid-retry-role-task', 'before_model', 'Agent_Unbound']) {
            const call = { name, id: 'call-invalid', args: { taskId: 'task' } }
            const send = routeAgentToolCall(call, state, tools, 'unknown_tool')
            expect(send.node).toBe('unknown_tool')
            expect(send.args).toEqual({ ...state, toolCall: call })
        }
        expect(routeAgentToolCall({ name: 'bid_retry_role_task', args: {} }, state, tools, 'unknown_tool').node).toBe(
            'bid_retry_role_task'
        )
    })

    it('returns a matching error ToolMessage through a compiled graph instead of an invalid Send packet', async () => {
        const call = { name: 'bid-retry-role-task', id: 'call-invalid', args: { taskId: 'task' } }
        const State = Annotation.Root({
            messages: Annotation<ToolMessage[]>({ reducer: (old, next) => [...old, ...next] })
        })
        const graph = new StateGraph(State)
            .addNode('model', () => ({}))
            .addNode('unknown_tool', new ToolNode([], { caller: 'Agent_Bid', toolName: 'Tool' }))
            .addEdge(START, 'model')
            .addConditionalEdges('model', (state) => routeAgentToolCall(call, state, new Set(), 'unknown_tool'), [
                'unknown_tool'
            ])
            .addEdge('unknown_tool', END)
            .compile()
        const result = await graph.invoke({ messages: [] })
        expect(result.messages).toHaveLength(1)
        expect(result.messages[0]).toMatchObject({ name: call.name, tool_call_id: call.id, status: 'error' })
        expect(result.messages[0].content).toContain('not found')
    })
})
