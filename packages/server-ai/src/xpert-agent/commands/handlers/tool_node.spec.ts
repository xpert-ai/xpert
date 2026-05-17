import { AIMessage, ToolMessage } from '@langchain/core/messages'
import { channelName } from '@xpert-ai/contracts'
import { ToolNode } from './tool_node'

describe('ToolNode', () => {
    it('runs a targeted tool call even when a synthetic HITL tool message trails the assistant message', async () => {
        const invoke = jest.fn().mockResolvedValue('removed')
        const node = new ToolNode(
            [
                {
                    name: 'deleteSkill',
                    invoke
                } as any
            ],
            {
                caller: 'agent-1',
                toolName: 'Skills'
            }
        )
        const aiMessage = new AIMessage({
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
        const rejection = new ToolMessage({
            content: 'keep this one',
            name: 'deleteSkill',
            tool_call_id: 'call-rejected'
        })

        const result = await node.invoke({
            messages: [aiMessage, rejection],
            [channelName('agent-1')]: {
                messages: [aiMessage, rejection]
            },
            toolCall: {
                type: 'tool_call',
                id: 'call-approved',
                name: 'deleteSkill',
                args: {
                    skillName: 'remove-skill'
                }
            }
        })

        expect(invoke).toHaveBeenCalledWith(
            expect.objectContaining({
                id: 'call-approved',
                args: {
                    skillName: 'remove-skill'
                }
            }),
            expect.any(Object)
        )
        expect(result[channelName('agent-1')].messages[0]).toEqual(
            expect.objectContaining({
                tool_call_id: 'call-approved',
                content: 'removed'
            })
        )
    })
})
