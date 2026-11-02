jest.mock('../../../xpert-toolset', () => ({
    ToolsetGetToolsCommand: class ToolsetGetToolsCommand {
        constructor(
            public readonly ids: string[],
            public readonly environment?: Record<string, unknown>
        ) {}
    }
}))

jest.mock('../../../shared', () => ({
    _BaseToolset: class BaseToolset {},
    BuiltinToolset: class BuiltinToolset {},
    closeToolsets: jest.fn(async () => undefined),
    identifyAgent: (agent: { key?: string; name?: string }) => ({ key: agent.key, name: agent.name })
}))

import { AIMessage, AIMessageChunk, ToolMessage } from '@langchain/core/messages'
import { tool } from '@langchain/core/tools'
import type { PregelTaskDescription } from '@langchain/langgraph/dist/pregel/types'
import { z } from 'zod/v3'
import { channelName, type IXpertAgent } from '@xpert-ai/contracts'
import type { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ToolsetGetToolsCommand } from '../../../xpert-toolset'
import { CompleteToolCallsQuery } from '../complete-tool-calls.query'
import { CompleteToolCallsHandler } from './complete-tool-calls.handler'

describe('CompleteToolCallsHandler workspace scope', () => {
    it.each([AIMessage, AIMessageChunk])(
        'enriches distinct same-name approvals after tool results (%p)',
        async (Message) => {
            const calls = [0, 1, 2, 3].map((index) => ({ id: `call-${index}`, name: 'read', args: { index } }))
            const tasks: PregelTaskDescription[] = [1, 2, 3].map((index) => ({
                id: `task-${index}`,
                name: 'read',
                interrupts: [{ value: 'approve' }],
                path: ['__pregel_push', index]
            }))
            const read = tool(async () => 'OK', {
                name: 'read',
                description: 'Read a file',
                schema: z.object({ index: z.number() })
            })
            const commandBus = { execute: jest.fn().mockResolvedValue([{ initTools: async () => [read] }]) }
            const queryBus = { execute: jest.fn().mockResolvedValue({ key: 'agent_current', toolsetIds: [] }) }
            const handler = new CompleteToolCallsHandler(
                commandBus as unknown as CommandBus,
                queryBus as unknown as QueryBus
            )
            const operation = await handler.execute(
                new CompleteToolCallsQuery(
                    'xpert',
                    tasks,
                    {
                        agent_old_channel: {
                            messages: [
                                new Message({ content: '', tool_calls: [{ id: 'old', name: 'read', args: {} }] })
                            ]
                        },
                        agent_current_channel: {
                            messages: [
                                new Message({ content: '', tool_calls: calls }),
                                new ToolMessage({ content: 'OK', tool_call_id: 'call-0' })
                            ]
                        }
                    },
                    false,
                    'project',
                    {
                        channel_values: {
                            __pregel_tasks: [[], calls.map((toolCall) => ({ node: 'read', args: { toolCall } }))]
                        }
                    }
                )
            )
            expect(operation.tasks.map((task) => task.call.id)).toEqual(['call-1', 'call-2', 'call-3'])
            expect(operation.tasks.map((task) => task.call.args)).toEqual([{ index: 1 }, { index: 2 }, { index: 3 }])
            expect(operation.tasks.every((task) => task.type === 'tool')).toBe(true)
            expect(queryBus.execute.mock.calls.every(([query]) => query.agentKey === 'agent_current')).toBe(true)
        }
    )

    it.each([
        ['Project', 'project-1'],
        ['user-Xpert', undefined]
    ] as const)('passes persisted Xpert policy through the %s toolset lookup', async (_label, projectId) => {
        const commandBus = { execute: jest.fn().mockResolvedValue([]) }
        const agent = {
            key: 'agent_1',
            toolsetIds: ['toolset-1'],
            team: {
                id: 'xpert-1',
                workspaceId: 'workspace-1',
                workspaceDataScope: 'user'
            }
        } as IXpertAgent
        const queryBus = { execute: jest.fn().mockResolvedValue(agent) }
        const handler = new CompleteToolCallsHandler(
            commandBus as unknown as CommandBus,
            queryBus as unknown as QueryBus
        )
        const toolCall = { id: 'call-1', name: 'search', type: 'tool_call' as const, args: {} }

        await handler.execute(
            new CompleteToolCallsQuery(
                'xpert-1',
                [{ id: 'task-1', name: 'search' }] as never,
                {
                    [channelName(agent.key)]: {
                        messages: [new AIMessageChunk({ content: '', tool_calls: [toolCall] })]
                    }
                } as never,
                false,
                projectId
            )
        )

        const getToolsCommand = commandBus.execute.mock.calls[0][0] as ToolsetGetToolsCommand
        expect(getToolsCommand.environment).toEqual(
            expect.objectContaining({
                projectId,
                workspaceId: 'workspace-1',
                xpertId: 'xpert-1',
                workspaceDataScope: 'user'
            })
        )
        expect(getToolsCommand.environment).not.toHaveProperty('catalog')
        expect(getToolsCommand.environment).not.toHaveProperty('scopeId')
        expect(getToolsCommand.environment).not.toHaveProperty('isolateByUser')
    })
})
