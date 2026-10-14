import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages'
import { tool } from '@langchain/core/tools'
import { Annotation, Command, END, MemorySaver, START, StateGraph } from '@langchain/langgraph'
import { channelName, type IXpertAgent, type TXpertTeamNode } from '@xpert-ai/contracts'
import { z } from 'zod/v3'
import { createGraphNodeChannel } from '../../xpert-agent/graph-node-channel'
import { ToolNode } from '../../xpert-agent/commands/handlers/tool_node'
import { createTemplateOperationPolicy } from './template-operation-policy'

describe('template tool execution with durable graph approval', () => {
    const agent: TXpertTeamNode<'agent'> = {
        key: 'primary',
        type: 'agent',
        position: { x: 0, y: 0 },
        entity: { key: 'primary' } as IXpertAgent
    }
    const channel = channelName(agent.key)
    const state = Annotation.Root({ [channel]: createGraphNodeChannel(agent) })
    it('preserves imported agent history after a tool result and a later model response', async () => {
        const reducer = createGraphNodeChannel(agent)
        reducer.update([{ messages: [new HumanMessage('Begin')] }])
        reducer.update([
            { messages: [new AIMessage({ content: '', tool_calls: [{ name: 'read', id: 'read-1', args: {} }] })] }
        ])
        reducer.update([{ messages: [new ToolMessage({ content: 'read result', tool_call_id: 'read-1' })] }])
        reducer.update([{ messages: [new AIMessage('First result based on the file')] }])
        expect(reducer.get().messages).toHaveLength(4)
    })
    it.each(['approve', 'reject'] as const)(
        'resumes a persisted %s decision at the real ToolNode',
        async (decision) => {
            const write = jest.fn(async () => 'written')
            const target = tool(write, {
                name: 'write_file',
                description: 'Write test content',
                schema: z.object({ content: z.string() })
            })
            const policy = createTemplateOperationPolicy({ default: 'approve', rules: [] })
            const graph = new StateGraph(state)
                .addNode(
                    'write',
                    new ToolNode([target], {
                        caller: 'primary',
                        toolName: 'Write test content',
                        wrapToolCall: policy.wrapToolCall
                    })
                )
                .addEdge(START, 'write')
                .addEdge('write', END)
                .compile({ checkpointer: new MemorySaver() })
            const config = { configurable: { thread_id: `approval-${decision}` } }
            await graph.invoke(
                {
                    [channel]: {
                        messages: [
                            new AIMessage({
                                content: '',
                                tool_calls: [{ name: 'write_file', id: 'write-1', args: { content: 'reviewed value' } }]
                            })
                        ]
                    }
                },
                config
            )
            expect(write).not.toHaveBeenCalled()
            expect((await graph.getState(config)).tasks[0].interrupts).toHaveLength(1)
            await graph.invoke(new Command({ resume: { decisions: [{ type: decision }] } }), config)
            expect(write).toHaveBeenCalledTimes(decision === 'approve' ? 1 : 0)
            expect((await graph.getState(config)).next).toEqual([])
            // Reconnecting after completion must not run the side effect again.
            await graph.invoke(null, config)
            expect(write).toHaveBeenCalledTimes(decision === 'approve' ? 1 : 0)
        }
    )
})
