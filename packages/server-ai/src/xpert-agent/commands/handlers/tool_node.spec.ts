import { AIMessage, ToolMessage } from '@langchain/core/messages'
import { tool } from '@langchain/core/tools'
import { channelName } from '@xpert-ai/contracts'
import { z } from 'zod/v3'
import { platformFailure } from '../../../plugin-resource/app-platform/platform-error'
import { ToolNode } from './tool_node'
import { createAgentToolInput } from './agent-tool-input'

describe('ToolNode', () => {
    it('stops instead of asking the model to retry when account storage is full', async () => {
        const invoke = jest.fn(async () => {
            throw platformFailure('application_storage_limit', 413)
        })
        const node = new ToolNode([tool(invoke, { name: 'save', schema: z.object({}) })], { toolName: 'Save' })
        await expect(
            node.invoke({
                messages: [
                    new AIMessage({
                        content: '',
                        tool_calls: [{ name: 'save', args: {}, id: 'save-1', type: 'tool_call' }]
                    })
                ]
            })
        ).rejects.toThrow('APP_PLATFORM_FAILURE:application_storage_limit')
        expect(invoke).toHaveBeenCalledTimes(1)
    })
    it.each([undefined, () => null, () => [], () => [{ id: 'other', state: {} }]])(
        'fails before middleware when referenced state is unavailable',
        async (read) => {
            const wrapToolCall = jest.fn(async () => new ToolMessage({ content: 'updated', tool_call_id: 'call-1' }))
            const projectTool = tool(async () => 'updated', { name: 'project_update', schema: z.object({}) })
            const node = new ToolNode([projectTool], { toolName: 'Project', wrapToolCall })
            const input = createAgentToolInput({ name: 'project_update', id: 'call-1', args: {} }, 'snapshot-1')

            await expect(node.invoke(input, { configurable: { __pregel_read: read } })).rejects.toThrow()
            expect(wrapToolCall).not.toHaveBeenCalled()
        }
    )

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
