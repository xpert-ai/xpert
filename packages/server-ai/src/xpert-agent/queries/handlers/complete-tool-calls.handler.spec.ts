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
    findChannelByTool: (values: Record<string, unknown>) => Object.entries(values)[0] ?? [],
    identifyAgent: (agent: { key?: string; name?: string }) => ({ key: agent.key, name: agent.name })
}))

import { AIMessageChunk } from '@langchain/core/messages'
import { channelName, type IXpertAgent } from '@xpert-ai/contracts'
import type { CommandBus, QueryBus } from '@nestjs/cqrs'
import { ToolsetGetToolsCommand } from '../../../xpert-toolset'
import { CompleteToolCallsQuery } from '../complete-tool-calls.query'
import { CompleteToolCallsHandler } from './complete-tool-calls.handler'

describe('CompleteToolCallsHandler workspace scope', () => {
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
