jest.mock('../../xpert.service', () => ({
    XpertService: class {}
}))
jest.mock('../../../assistant-binding/assistant-binding.service', () => ({
    AssistantBindingService: class {}
}))
jest.mock('@xpert-ai/contracts', () => {
    const actual = jest.requireActual('@xpert-ai/contracts')
    return {
        ...actual,
        createMessageAppendContextTracker: () => ({
            resolve: () => ({
                messageContext: undefined
            }),
            reset: () => undefined
        }),
        stringifyMessageContent: (value: unknown) => (typeof value === 'string' ? value : String(value ?? ''))
    }
})

import { of, lastValueFrom, toArray } from 'rxjs'
import { ChatMessageEventTypeEnum, ChatMessageTypeEnum, XpertAgentExecutionStatusEnum } from '@xpert-ai/contracts'
import { BadRequestException } from '@nestjs/common'
import { ChatConversationUpsertCommand } from '../../../chat-conversation/commands/upsert.command'
import { ChatMessageUpsertCommand } from '../../../chat-message/commands/upsert.command'
import { CopilotCheckpointGetTupleQuery } from '../../../copilot-checkpoint/queries'
import { CreateMemoryStoreCommand } from '../../../shared/commands/create-memory-store.command'
import { XpertAgentChatCommand } from '../../../xpert-agent/commands/chat.command'
import { XpertAgentExecutionUpsertCommand } from '../../../xpert-agent-execution/commands/upsert.command'
import { XpertAgentExecutionOneQuery } from '../../../xpert-agent-execution/queries/get-one.query'
import { XpertChatCommand } from '../chat.command'
import { XpertChatHandler } from './chat.handler'

describe('XpertChatHandler', () => {
    let xpertService: { findOne: jest.Mock }
    let assistantBindingService: {
        getBinding: jest.Mock
        getUserPreferenceByAssistantId: jest.Mock
    }
    let commandBus: { execute: jest.Mock }
    let queryBus: { execute: jest.Mock }
    let handler: XpertChatHandler

    const xpert = {
        id: 'xpert-1',
        workspaceId: 'workspace-1',
        agent: {
            key: 'agent-1'
        },
        memory: null,
        features: {},
        agentConfig: {}
    } as any

    beforeEach(() => {
        xpertService = {
            findOne: jest.fn().mockResolvedValue(xpert)
        }
        assistantBindingService = {
            getBinding: jest.fn().mockResolvedValue({
                assistantId: 'xpert-1'
            }),
            getUserPreferenceByAssistantId: jest.fn().mockResolvedValue({
                soul: '# Rules',
                profile: '# Profile',
                toolPreferences: {
                    version: 1,
                    toolsets: {
                        'toolset-1': {
                            toolsetName: 'Toolset 1',
                            disabledTools: ['search']
                        }
                    },
                    skills: {
                        'workspace-1': {
                            workspaceId: 'workspace-1',
                            disabledSkillIds: ['skill-2']
                        }
                    }
                }
            })
        }
        commandBus = {
            execute: jest.fn()
        }
        queryBus = {
            execute: jest.fn()
        }

        handler = new XpertChatHandler(
            xpertService as any,
            assistantBindingService as any,
            commandBus as any,
            queryBus as any
        )
    })

    it('creates a new conversation, human message, ai placeholder and execution for send', async () => {
        const commands: any[] = []
        commandBus.execute.mockImplementation(async (command) => {
            commands.push(command)

            if (command instanceof CreateMemoryStoreCommand) {
                return null
            }
            if (command instanceof ChatConversationUpsertCommand) {
                if (!command.entity.id) {
                    return {
                        id: 'conversation-1',
                        threadId: 'thread-1',
                        messages: [],
                        status: command.entity.status,
                        title: null,
                        options: command.entity.options
                    }
                }
                return {
                    id: 'conversation-1',
                    threadId: 'thread-1',
                    status: command.entity.status,
                    title: command.entity.title,
                    error: command.entity.error,
                    operation: command.entity.operation,
                    options: command.entity.options
                }
            }
            if (command instanceof XpertAgentExecutionUpsertCommand) {
                if (command.execution.status === XpertAgentExecutionStatusEnum.RUNNING) {
                    return {
                        id: 'execution-1',
                        threadId: 'thread-1'
                    }
                }
                return command.execution
            }
            if (command instanceof ChatMessageUpsertCommand) {
                if (command.entity.role === 'human') {
                    return {
                        id: 'human-1',
                        ...command.entity
                    }
                }
                if (command.entity.role === 'ai' && command.entity.status === 'thinking') {
                    return {
                        id: 'ai-1',
                        ...command.entity
                    }
                }
                return command.entity
            }
            if (command instanceof XpertAgentChatCommand) {
                return of({
                    data: {
                        type: ChatMessageTypeEnum.EVENT,
                        event: ChatMessageEventTypeEnum.ON_AGENT_END,
                        data: {
                            id: 'execution-1',
                            status: XpertAgentExecutionStatusEnum.SUCCESS,
                            title: 'Generated title'
                        }
                    }
                } as MessageEvent)
            }
            return null
        })

        const stream = await handler.execute(
            new XpertChatCommand(
                {
                    action: 'send',
                    message: {
                        clientMessageId: 'client-1',
                        input: {
                            input: 'Hello world'
                        }
                    }
                },
                {
                    xpertId: 'xpert-1'
                } as any
            )
        )

        const events = await lastValueFrom(stream.pipe(toArray()))

        expect(events.map((event) => event.data.event)).toEqual(
            expect.arrayContaining([
                ChatMessageEventTypeEnum.ON_CONVERSATION_START,
                ChatMessageEventTypeEnum.ON_MESSAGE_START,
                ChatMessageEventTypeEnum.ON_MESSAGE_END,
                ChatMessageEventTypeEnum.ON_CONVERSATION_END
            ])
        )

        expect(commands.some((command) => command instanceof ChatConversationUpsertCommand && !command.entity.id)).toBe(
            true
        )
        expect(
            commands.some((command) => command instanceof ChatMessageUpsertCommand && command.entity.role === 'human')
        ).toBe(true)
        const humanMessageCommand = commands.find(
            (command) => command instanceof ChatMessageUpsertCommand && command.entity.role === 'human'
        ) as ChatMessageUpsertCommand
        expect(humanMessageCommand.entity.id).toBeUndefined()
        expect(
            commands.some(
                (command) =>
                    command instanceof ChatMessageUpsertCommand &&
                    command.entity.role === 'ai' &&
                    command.entity.status === 'thinking'
            )
        ).toBe(true)
        expect(
            commands.some(
                (command) =>
                    command instanceof XpertAgentExecutionUpsertCommand &&
                    command.execution.status === XpertAgentExecutionStatusEnum.RUNNING
            )
        ).toBe(true)

        const agentCommand = commands.find(
            (command) => command instanceof XpertAgentChatCommand
        ) as XpertAgentChatCommand
        expect(agentCommand.options.resume).toBeUndefined()
        expect(agentCommand.state.sys).toEqual(
            expect.objectContaining({
                soul: '# Rules',
                profile: '# Profile'
            })
        )
        expect(agentCommand.state.selectedSkillWorkspaceId).toBe('workspace-1')
        expect(agentCommand.state.disabledSkillIds).toEqual(['skill-2'])
        expect(agentCommand.state.skillSelectionMode).toBe('workspace_blacklist')
        expect(agentCommand.options.toolPreferences).toEqual({
            version: 1,
            toolsets: {
                'toolset-1': {
                    toolsetName: 'Toolset 1',
                    disabledTools: ['search']
                }
            },
            skills: {
                'workspace-1': {
                    workspaceId: 'workspace-1',
                    disabledSkillIds: ['skill-2']
                }
            }
        })
    })

    it('forwards project scope to the agent sandbox options for project conversations', async () => {
        const commands: any[] = []
        commandBus.execute.mockImplementation(async (command) => {
            commands.push(command)

            if (command instanceof CreateMemoryStoreCommand) {
                return null
            }
            if (command instanceof ChatConversationUpsertCommand) {
                if (!command.entity.id) {
                    return {
                        id: 'conversation-1',
                        threadId: 'thread-1',
                        projectId: command.entity.projectId,
                        messages: [],
                        status: command.entity.status,
                        title: null,
                        options: command.entity.options
                    }
                }
                return {
                    id: 'conversation-1',
                    threadId: 'thread-1',
                    projectId: 'project-1',
                    status: command.entity.status,
                    title: command.entity.title,
                    error: command.entity.error,
                    operation: command.entity.operation,
                    options: command.entity.options
                }
            }
            if (command instanceof XpertAgentExecutionUpsertCommand) {
                return {
                    id: 'execution-1',
                    threadId: 'thread-1'
                }
            }
            if (command instanceof ChatMessageUpsertCommand) {
                return {
                    id: `${command.entity.role}-1`,
                    ...command.entity
                }
            }
            if (command instanceof XpertAgentChatCommand) {
                return of({
                    data: {
                        type: ChatMessageTypeEnum.EVENT,
                        event: ChatMessageEventTypeEnum.ON_AGENT_END,
                        data: {
                            id: 'execution-1',
                            status: XpertAgentExecutionStatusEnum.SUCCESS,
                            title: 'Generated title'
                        }
                    }
                } as MessageEvent)
            }
            return null
        })

        const stream = await handler.execute(
            new XpertChatCommand(
                {
                    action: 'send',
                    projectId: 'project-1',
                    message: {
                        clientMessageId: 'client-1',
                        input: {
                            input: 'Hello workspace'
                        }
                    }
                },
                {
                    xpertId: 'xpert-1'
                } as any
            )
        )

        await lastValueFrom(stream.pipe(toArray()))

        const agentCommand = commands.find(
            (command) => command instanceof XpertAgentChatCommand
        ) as XpertAgentChatCommand

        expect(agentCommand.options.projectId).toBe('project-1')
        expect(agentCommand.options.sandboxEnvironmentId).toBeUndefined()
    })

    it('reuses a persisted pending follow-up instead of creating a duplicate human message on fallback send', async () => {
        const commands: any[] = []
        commandBus.execute.mockImplementation(async (command) => {
            commands.push(command)

            if (command instanceof CreateMemoryStoreCommand) {
                return null
            }
            if (command instanceof ChatConversationUpsertCommand) {
                return {
                    id: 'conversation-1',
                    threadId: 'thread-1',
                    messages: [
                        {
                            id: 'ai-parent-1',
                            role: 'ai',
                            content: 'Previous reply'
                        },
                        {
                            id: 'follow-up-1',
                            parentId: 'ai-parent-1',
                            role: 'human',
                            content: 'Please continue',
                            conversationId: 'conversation-1',
                            followUpMode: 'queue',
                            followUpStatus: 'pending',
                            thirdPartyMessage: {
                                followUpClientMessageId: 'client-1',
                                followUpInput: {
                                    input: 'Please continue'
                                }
                            }
                        }
                    ],
                    status: command.entity.status,
                    title: null,
                    error: command.entity.error,
                    operation: command.entity.operation,
                    options: {}
                }
            }
            if (command instanceof XpertAgentExecutionUpsertCommand) {
                if (command.execution.status === XpertAgentExecutionStatusEnum.RUNNING) {
                    return {
                        id: 'execution-1',
                        threadId: 'thread-1'
                    }
                }
                return command.execution
            }
            if (command instanceof ChatMessageUpsertCommand) {
                if (command.entity.id === 'follow-up-1') {
                    return {
                        ...command.entity
                    }
                }
                if (command.entity.role === 'ai' && command.entity.status === 'thinking') {
                    return {
                        id: 'ai-1',
                        ...command.entity
                    }
                }
                return command.entity
            }
            if (command instanceof XpertAgentChatCommand) {
                return of({
                    data: {
                        type: ChatMessageTypeEnum.EVENT,
                        event: ChatMessageEventTypeEnum.ON_AGENT_END,
                        data: {
                            id: 'execution-1',
                            status: XpertAgentExecutionStatusEnum.SUCCESS,
                            title: 'Generated title'
                        }
                    }
                } as MessageEvent)
            }
            return null
        })

        const stream = await handler.execute(
            new XpertChatCommand(
                {
                    action: 'send',
                    conversationId: 'conversation-1',
                    message: {
                        clientMessageId: 'client-1',
                        input: {
                            input: 'Please continue'
                        }
                    }
                },
                {
                    xpertId: 'xpert-1'
                } as any
            )
        )

        await lastValueFrom(stream.pipe(toArray()))

        const humanCommands = commands.filter(
            (command) => command instanceof ChatMessageUpsertCommand && command.entity.role === 'human'
        ) as ChatMessageUpsertCommand[]

        expect(humanCommands).toHaveLength(1)
        expect(humanCommands[0].entity).toEqual(
            expect.objectContaining({
                id: 'follow-up-1',
                content: 'Please continue',
                followUpStatus: 'consumed'
            })
        )
        expect(humanCommands[0].entity.visibleAt).toBeInstanceOf(Date)
    })

    it('merges queued pending follow-ups for the same target execution into one send turn', async () => {
        const commands: any[] = []
        commandBus.execute.mockImplementation(async (command) => {
            commands.push(command)

            if (command instanceof CreateMemoryStoreCommand) {
                return null
            }
            if (command instanceof ChatConversationUpsertCommand) {
                return {
                    id: 'conversation-1',
                    threadId: 'thread-1',
                    messages: [
                        {
                            id: 'ai-parent-1',
                            role: 'ai',
                            content: 'Previous reply',
                            executionId: 'execution-prev'
                        },
                        {
                            id: 'follow-up-1',
                            parentId: 'ai-parent-1',
                            role: 'human',
                            content: 'Please continue',
                            conversationId: 'conversation-1',
                            createdAt: '2026-04-17T00:00:00.000Z',
                            followUpMode: 'queue',
                            followUpStatus: 'pending',
                            targetExecutionId: 'execution-prev',
                            references: [
                                {
                                    type: 'quote',
                                    text: 'ref-1'
                                }
                            ],
                            attachments: [
                                {
                                    id: 'file-1'
                                }
                            ],
                            thirdPartyMessage: {
                                followUpClientMessageId: 'client-1',
                                followUpInput: {
                                    input: 'Please continue',
                                    references: [
                                        {
                                            type: 'quote',
                                            text: 'ref-1'
                                        }
                                    ],
                                    files: [
                                        {
                                            id: 'file-1'
                                        }
                                    ]
                                }
                            }
                        },
                        {
                            id: 'follow-up-2',
                            parentId: 'follow-up-1',
                            role: 'human',
                            content: 'And add detail',
                            conversationId: 'conversation-1',
                            createdAt: '2026-04-17T00:00:01.000Z',
                            followUpMode: 'queue',
                            followUpStatus: 'pending',
                            targetExecutionId: 'execution-prev',
                            thirdPartyMessage: {
                                followUpClientMessageId: 'client-2',
                                followUpInput: {
                                    input: 'And add detail',
                                    custom: 'latest'
                                }
                            }
                        }
                    ],
                    status: command.entity.status,
                    title: null,
                    error: command.entity.error,
                    operation: command.entity.operation,
                    options: {}
                }
            }
            if (command instanceof XpertAgentExecutionUpsertCommand) {
                if (command.execution.status === XpertAgentExecutionStatusEnum.RUNNING) {
                    return {
                        id: 'execution-1',
                        threadId: 'thread-1'
                    }
                }
                return command.execution
            }
            if (command instanceof ChatMessageUpsertCommand) {
                if (command.entity.id === 'follow-up-1' || command.entity.id === 'follow-up-2') {
                    return {
                        ...command.entity
                    }
                }
                if (command.entity.role === 'ai' && command.entity.status === 'thinking') {
                    return {
                        id: 'ai-1',
                        ...command.entity
                    }
                }
                return command.entity
            }
            if (command instanceof XpertAgentChatCommand) {
                return of({
                    data: {
                        type: ChatMessageTypeEnum.EVENT,
                        event: ChatMessageEventTypeEnum.ON_AGENT_END,
                        data: {
                            id: 'execution-1',
                            status: XpertAgentExecutionStatusEnum.SUCCESS,
                            title: 'Generated title'
                        }
                    }
                } as MessageEvent)
            }
            return null
        })

        const stream = await handler.execute(
            new XpertChatCommand(
                {
                    action: 'send',
                    conversationId: 'conversation-1',
                    message: {
                        clientMessageId: 'client-1',
                        input: {
                            input: 'Please continue'
                        }
                    }
                },
                {
                    xpertId: 'xpert-1'
                } as any
            )
        )

        const events = await lastValueFrom(stream.pipe(toArray()))

        const humanCommands = commands.filter(
            (command) =>
                command instanceof ChatMessageUpsertCommand &&
                command.entity.role === 'human' &&
                (command.entity.id === 'follow-up-1' || command.entity.id === 'follow-up-2')
        ) as ChatMessageUpsertCommand[]

        expect(humanCommands).toHaveLength(2)
        expect(humanCommands.map((command) => command.entity.id)).toEqual(['follow-up-1', 'follow-up-2'])
        expect(humanCommands.every((command) => command.entity.followUpStatus === 'consumed')).toBe(true)
        expect(humanCommands.every((command) => command.entity.visibleAt instanceof Date)).toBe(true)

        const agentCommand = commands.find(
            (command) => command instanceof XpertAgentChatCommand
        ) as XpertAgentChatCommand
        expect(agentCommand.state.human).toEqual({
            input: 'Please continue\n\nAnd add detail',
            references: [
                {
                    type: 'quote',
                    text: 'ref-1'
                }
            ],
            files: [
                {
                    id: 'file-1'
                }
            ],
            custom: 'latest'
        })

        const aiPlaceholderCommand = commands.find(
            (command) =>
                command instanceof ChatMessageUpsertCommand &&
                command.entity.role === 'ai' &&
                command.entity.status === 'thinking'
        ) as ChatMessageUpsertCommand
        expect(aiPlaceholderCommand.entity.parent).toEqual(
            expect.objectContaining({
                id: 'follow-up-2'
            })
        )

        expect(events).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    data: expect.objectContaining({
                        type: ChatMessageTypeEnum.EVENT,
                        event: ChatMessageEventTypeEnum.ON_CHAT_EVENT,
                        data: expect.objectContaining({
                            type: 'follow_up_consumed',
                            mode: 'queue',
                            clientMessageIds: ['client-1', 'client-2'],
                            messageIds: ['follow-up-1', 'follow-up-2'],
                            executionId: 'execution-prev'
                        })
                    })
                })
            ])
        )
    })

    it('rejects send requests with a null message payload', async () => {
        await expect(
            handler.execute(
                new XpertChatCommand(
                    {
                        action: 'send',
                        message: null as any
                    },
                    {
                        xpertId: 'xpert-1'
                    } as any
                )
            )
        ).rejects.toThrow(new BadRequestException('Invalid send request: message.input is required'))
    })

    it('passes a null tool preference snapshot when the user preference has no tool preferences', async () => {
        assistantBindingService.getUserPreferenceByAssistantId.mockResolvedValueOnce({
            soul: '# Rules',
            profile: '# Profile',
            toolPreferences: null
        })

        const commands: any[] = []
        commandBus.execute.mockImplementation(async (command) => {
            commands.push(command)

            if (command instanceof CreateMemoryStoreCommand) {
                return null
            }
            if (command instanceof ChatConversationUpsertCommand) {
                if (!command.entity.id) {
                    return {
                        id: 'conversation-1',
                        threadId: 'thread-1',
                        messages: [],
                        status: command.entity.status,
                        title: null,
                        options: command.entity.options
                    }
                }
                return {
                    id: 'conversation-1',
                    threadId: 'thread-1',
                    status: command.entity.status,
                    title: command.entity.title,
                    error: command.entity.error,
                    operation: command.entity.operation,
                    options: command.entity.options
                }
            }
            if (command instanceof XpertAgentExecutionUpsertCommand) {
                if (command.execution.status === XpertAgentExecutionStatusEnum.RUNNING) {
                    return {
                        id: 'execution-1',
                        threadId: 'thread-1'
                    }
                }
                return command.execution
            }
            if (command instanceof ChatMessageUpsertCommand) {
                if (command.entity.role === 'human') {
                    return {
                        id: 'human-1',
                        ...command.entity
                    }
                }
                if (command.entity.role === 'ai' && command.entity.status === 'thinking') {
                    return {
                        id: 'ai-1',
                        ...command.entity
                    }
                }
                return command.entity
            }
            if (command instanceof XpertAgentChatCommand) {
                return of({
                    data: {
                        type: ChatMessageTypeEnum.EVENT,
                        event: ChatMessageEventTypeEnum.ON_AGENT_END,
                        data: {
                            id: 'execution-1',
                            status: XpertAgentExecutionStatusEnum.SUCCESS
                        }
                    }
                } as MessageEvent)
            }
            return null
        })

        const stream = await handler.execute(
            new XpertChatCommand(
                {
                    action: 'send',
                    message: {
                        clientMessageId: 'client-1',
                        input: {
                            input: 'Hello world'
                        }
                    }
                },
                {
                    xpertId: 'xpert-1'
                } as any
            )
        )

        await lastValueFrom(stream.pipe(toArray()))

        const agentCommand = commands.find(
            (command) => command instanceof XpertAgentChatCommand
        ) as XpertAgentChatCommand
        expect(agentCommand.options.toolPreferences).toBeNull()
        expect(agentCommand.state.selectedSkillWorkspaceId).toBe('workspace-1')
        expect(agentCommand.state.disabledSkillIds).toEqual([])
        expect(agentCommand.state.skillSelectionMode).toBe('workspace_blacklist')
    })

    it('keeps the default skills middleware mode when the xpert is not bound through clawxpert', async () => {
        const commands: any[] = []
        assistantBindingService.getBinding.mockResolvedValue(null)
        assistantBindingService.getUserPreferenceByAssistantId.mockResolvedValue(null)
        commandBus.execute.mockImplementation(async (command) => {
            commands.push(command)

            if (command instanceof CreateMemoryStoreCommand) {
                return null
            }
            if (command instanceof ChatConversationUpsertCommand) {
                if (!command.entity.id) {
                    return {
                        id: 'conversation-1',
                        threadId: 'thread-1',
                        messages: [],
                        status: command.entity.status,
                        title: null,
                        options: command.entity.options
                    }
                }
                return {
                    id: 'conversation-1',
                    threadId: 'thread-1',
                    status: command.entity.status,
                    title: command.entity.title,
                    error: command.entity.error,
                    operation: command.entity.operation,
                    options: command.entity.options
                }
            }
            if (command instanceof XpertAgentExecutionUpsertCommand) {
                if (command.execution.status === XpertAgentExecutionStatusEnum.RUNNING) {
                    return {
                        id: 'execution-1',
                        threadId: 'thread-1'
                    }
                }
                return command.execution
            }
            if (command instanceof ChatMessageUpsertCommand) {
                if (command.entity.role === 'human') {
                    return {
                        id: 'human-1',
                        ...command.entity
                    }
                }
                if (command.entity.role === 'ai' && command.entity.status === 'thinking') {
                    return {
                        id: 'ai-1',
                        ...command.entity
                    }
                }
                return command.entity
            }
            if (command instanceof XpertAgentChatCommand) {
                return of({
                    data: {
                        type: ChatMessageTypeEnum.EVENT,
                        event: ChatMessageEventTypeEnum.ON_AGENT_END,
                        data: {
                            id: 'execution-1',
                            status: XpertAgentExecutionStatusEnum.SUCCESS
                        }
                    }
                } as MessageEvent)
            }
            return null
        })

        const stream = await handler.execute(
            new XpertChatCommand(
                {
                    action: 'send',
                    message: {
                        clientMessageId: 'client-1',
                        input: {
                            input: 'Hello world'
                        }
                    }
                },
                {
                    xpertId: 'xpert-1'
                } as any
            )
        )

        await lastValueFrom(stream.pipe(toArray()))

        const agentCommand = commands.find(
            (command) => command instanceof XpertAgentChatCommand
        ) as XpertAgentChatCommand
        expect(agentCommand.state.selectedSkillWorkspaceId).toBe('workspace-1')
        expect(agentCommand.state.disabledSkillIds).toEqual([])
        expect(agentCommand.state.skillSelectionMode).toBeUndefined()
    })

    it('reuses the interrupted ai message and execution for resume', async () => {
        const commands: any[] = []
        queryBus.execute.mockImplementation(async (query) => {
            if ('conditions' in query || 'params' in query) {
                return {
                    id: 'conversation-1',
                    threadId: 'thread-1',
                    messages: [
                        {
                            id: 'ai-1',
                            role: 'ai',
                            content: 'Pending',
                            executionId: 'execution-1',
                            status: XpertAgentExecutionStatusEnum.INTERRUPTED
                        }
                    ],
                    status: 'interrupted'
                }
            }
            return null
        })
        commandBus.execute.mockImplementation(async (command) => {
            commands.push(command)

            if (command instanceof CreateMemoryStoreCommand) {
                return null
            }
            if (command instanceof XpertAgentChatCommand) {
                return of({
                    data: {
                        type: ChatMessageTypeEnum.EVENT,
                        event: ChatMessageEventTypeEnum.ON_AGENT_END,
                        data: {
                            id: 'execution-1',
                            status: XpertAgentExecutionStatusEnum.SUCCESS
                        }
                    }
                } as MessageEvent)
            }
            if (command instanceof XpertAgentExecutionUpsertCommand) {
                return command.execution
            }
            if (command instanceof ChatMessageUpsertCommand) {
                return command.entity
            }
            if (command instanceof ChatConversationUpsertCommand) {
                return {
                    id: 'conversation-1',
                    threadId: 'thread-1',
                    status: command.entity.status,
                    title: command.entity.title,
                    error: command.entity.error,
                    operation: command.entity.operation,
                    options: command.entity.options
                }
            }
            return null
        })

        const stream = await handler.execute(
            new XpertChatCommand(
                {
                    action: 'resume',
                    conversationId: 'conversation-1',
                    target: {
                        aiMessageId: 'ai-1',
                        executionId: 'execution-1'
                    },
                    decision: {
                        type: 'confirm'
                    }
                },
                {
                    xpertId: 'xpert-1'
                } as any
            )
        )

        await lastValueFrom(stream.pipe(toArray()))

        expect(
            commands.some(
                (command) =>
                    command instanceof XpertAgentExecutionUpsertCommand &&
                    command.execution.status === XpertAgentExecutionStatusEnum.RUNNING
            )
        ).toBe(false)
        expect(
            commands.some(
                (command) =>
                    command instanceof ChatMessageUpsertCommand &&
                    command.entity.role === 'ai' &&
                    command.entity.status === 'thinking' &&
                    !command.entity.id
            )
        ).toBe(false)

        const agentCommand = commands.find(
            (command) => command instanceof XpertAgentChatCommand
        ) as XpertAgentChatCommand
        expect(agentCommand.options.execution).toEqual({
            id: 'execution-1',
            category: 'agent'
        })
        expect(agentCommand.options.resume).toEqual({
            decision: {
                type: 'confirm'
            },
            patch: undefined
        })
    })

    it('replays from the first human input checkpoint when human message has no executionId', async () => {
        const commands: any[] = []
        commandBus.execute.mockImplementation(async (command) => {
            commands.push(command)

            if (command instanceof CreateMemoryStoreCommand) {
                return null
            }
            if (command instanceof ChatConversationUpsertCommand) {
                return {
                    id: 'conversation-1',
                    threadId: 'thread-1',
                    messages: [
                        {
                            id: 'human-1',
                            role: 'human',
                            content: 'Original prompt'
                        },
                        {
                            id: 'ai-1',
                            role: 'ai',
                            parentId: 'human-1',
                            content: 'Original answer',
                            executionId: 'execution-old',
                            status: XpertAgentExecutionStatusEnum.SUCCESS
                        }
                    ],
                    status: 'busy',
                    options: {
                        parameters: {
                            input: 'Original prompt'
                        }
                    }
                }
            }
            if (command instanceof XpertAgentExecutionUpsertCommand) {
                if (command.execution.status === XpertAgentExecutionStatusEnum.RUNNING) {
                    return {
                        id: 'execution-new',
                        threadId: 'thread-1'
                    }
                }
                return command.execution
            }
            if (command instanceof ChatMessageUpsertCommand) {
                if (command.entity.role === 'ai' && command.entity.status === 'thinking') {
                    return {
                        id: 'ai-2',
                        ...command.entity
                    }
                }
                return command.entity
            }
            if (command instanceof XpertAgentChatCommand) {
                return of({
                    data: {
                        type: ChatMessageTypeEnum.EVENT,
                        event: ChatMessageEventTypeEnum.ON_AGENT_END,
                        data: {
                            id: 'execution-new',
                            status: XpertAgentExecutionStatusEnum.SUCCESS
                        }
                    }
                } as MessageEvent)
            }
            return null
        })
        queryBus.execute.mockImplementation(async (query) => {
            if (query instanceof XpertAgentExecutionOneQuery) {
                return {
                    id: 'execution-old',
                    threadId: 'thread-1',
                    checkpointNs: '',
                    checkpointId: 'checkpoint-loop-2',
                    inputs: {
                        input: 'Original prompt'
                    }
                }
            }
            if (query instanceof CopilotCheckpointGetTupleQuery) {
                switch (query.configurable.checkpoint_id) {
                    case 'checkpoint-loop-2':
                        return createCheckpointTuple('checkpoint-loop-2', 'loop', 'checkpoint-loop-1')
                    case 'checkpoint-loop-1':
                        return createCheckpointTuple('checkpoint-loop-1', 'loop', 'checkpoint-input-1')
                    case 'checkpoint-input-1':
                        return createCheckpointTuple('checkpoint-input-1', 'input', 'checkpoint-prev')
                    default:
                        return null
                }
            }
            return null
        })

        const stream = await handler.execute(
            new XpertChatCommand(
                {
                    action: 'retry',
                    conversationId: 'conversation-1',
                    source: {
                        aiMessageId: 'ai-1'
                    }
                },
                {
                    xpertId: 'xpert-1',
                    messageId: 'ai-1'
                } as any
            )
        )

        await lastValueFrom(stream.pipe(toArray()))

        expect(
            commands.some((command) => command instanceof ChatMessageUpsertCommand && command.entity.role === 'human')
        ).toBe(false)
        expect(
            commands.some(
                (command) =>
                    command instanceof XpertAgentExecutionUpsertCommand &&
                    command.execution.status === XpertAgentExecutionStatusEnum.RUNNING &&
                    command.execution.inputs?.input === 'Original prompt'
            )
        ).toBe(true)

        const agentCommand = commands.find(
            (command) => command instanceof XpertAgentChatCommand
        ) as XpertAgentChatCommand
        expect(agentCommand.options.resume).toBeUndefined()
        expect(agentCommand.options.checkpointId).toBe('checkpoint-input-1')
    })

    it('uses the explicit retry checkpoint without walking checkpoint ancestry', async () => {
        const commands: any[] = []
        commandBus.execute.mockImplementation(async (command) => {
            commands.push(command)

            if (command instanceof CreateMemoryStoreCommand) {
                return null
            }
            if (command instanceof ChatConversationUpsertCommand) {
                return {
                    id: 'conversation-1',
                    threadId: 'thread-1',
                    messages: [
                        {
                            id: 'human-1',
                            role: 'human',
                            content: 'Original prompt'
                        },
                        {
                            id: 'ai-1',
                            role: 'ai',
                            parentId: 'human-1',
                            content: 'Original answer',
                            executionId: 'execution-old',
                            status: XpertAgentExecutionStatusEnum.SUCCESS
                        }
                    ],
                    status: 'busy',
                    options: {
                        parameters: {
                            input: 'Original prompt'
                        }
                    }
                }
            }
            if (command instanceof XpertAgentExecutionUpsertCommand) {
                if (command.execution.status === XpertAgentExecutionStatusEnum.RUNNING) {
                    return {
                        id: 'execution-new',
                        threadId: 'thread-1'
                    }
                }
                return command.execution
            }
            if (command instanceof ChatMessageUpsertCommand) {
                if (command.entity.role === 'ai' && command.entity.status === 'thinking') {
                    return {
                        id: 'ai-2',
                        ...command.entity
                    }
                }
                return command.entity
            }
            if (command instanceof XpertAgentChatCommand) {
                return of({
                    data: {
                        type: ChatMessageTypeEnum.EVENT,
                        event: ChatMessageEventTypeEnum.ON_AGENT_END,
                        data: {
                            id: 'execution-new',
                            status: XpertAgentExecutionStatusEnum.SUCCESS
                        }
                    }
                } as MessageEvent)
            }
            return null
        })
        queryBus.execute.mockImplementation(async (query) => {
            if (query instanceof XpertAgentExecutionOneQuery) {
                return {
                    id: 'execution-old',
                    threadId: 'thread-1',
                    checkpointNs: '',
                    checkpointId: 'checkpoint-loop-2',
                    inputs: {
                        input: 'Original prompt'
                    }
                }
            }
            if (query instanceof CopilotCheckpointGetTupleQuery) {
                throw new Error('Retry ancestry lookup should be skipped when checkpointId is provided')
            }
            return null
        })

        const stream = await handler.execute(
            new XpertChatCommand(
                {
                    action: 'retry',
                    conversationId: 'conversation-1',
                    source: {
                        aiMessageId: 'ai-1'
                    },
                    checkpointId: 'checkpoint-history-1'
                },
                {
                    xpertId: 'xpert-1',
                    messageId: 'ai-1'
                } as any
            )
        )

        await lastValueFrom(stream.pipe(toArray()))

        const agentCommand = commands.find(
            (command) => command instanceof XpertAgentChatCommand
        ) as XpertAgentChatCommand
        expect(agentCommand.options.checkpointId).toBe('checkpoint-history-1')
        expect(queryBus.execute.mock.calls.some(([query]) => query instanceof CopilotCheckpointGetTupleQuery)).toBe(
            false
        )
    })

    it('uses the requested ai message instead of the latest ai message when retrying', async () => {
        const commands: any[] = []
        commandBus.execute.mockImplementation(async (command) => {
            commands.push(command)

            if (command instanceof CreateMemoryStoreCommand) {
                return null
            }
            if (command instanceof ChatConversationUpsertCommand) {
                return {
                    id: 'conversation-1',
                    threadId: 'thread-1',
                    messages: [
                        {
                            id: 'human-1',
                            role: 'human',
                            content: 'Original prompt 1'
                        },
                        {
                            id: 'ai-1',
                            role: 'ai',
                            parentId: 'human-1',
                            content: 'Original answer 1',
                            executionId: 'execution-old-1',
                            status: XpertAgentExecutionStatusEnum.SUCCESS
                        },
                        {
                            id: 'human-2',
                            role: 'human',
                            content: 'Original prompt 2'
                        },
                        {
                            id: 'ai-2',
                            role: 'ai',
                            parentId: 'human-2',
                            content: 'Original answer 2',
                            executionId: 'execution-old-2',
                            status: XpertAgentExecutionStatusEnum.SUCCESS
                        }
                    ],
                    status: 'busy',
                    options: {
                        parameters: {
                            locale: 'zh-CN',
                            input: 'Latest prompt'
                        }
                    }
                }
            }
            if (command instanceof XpertAgentExecutionUpsertCommand) {
                if (command.execution.status === XpertAgentExecutionStatusEnum.RUNNING) {
                    return {
                        id: 'execution-new',
                        threadId: 'thread-1'
                    }
                }
                return command.execution
            }
            if (command instanceof ChatMessageUpsertCommand) {
                if (command.entity.role === 'ai' && command.entity.status === 'thinking') {
                    return {
                        id: 'ai-2',
                        ...command.entity
                    }
                }
                return command.entity
            }
            if (command instanceof XpertAgentChatCommand) {
                return of({
                    data: {
                        type: ChatMessageTypeEnum.EVENT,
                        event: ChatMessageEventTypeEnum.ON_AGENT_END,
                        data: {
                            id: 'execution-new',
                            status: XpertAgentExecutionStatusEnum.SUCCESS
                        }
                    }
                } as MessageEvent)
            }
            return null
        })
        queryBus.execute.mockImplementation(async (query) => {
            if (query instanceof XpertAgentExecutionOneQuery) {
                if (query.id === 'execution-old-1') {
                    return {
                        id: 'execution-old-1',
                        threadId: 'thread-1',
                        checkpointNs: '',
                        checkpointId: 'checkpoint-loop-1',
                        inputs: {
                            input: 'Original prompt 1'
                        }
                    }
                }
                if (query.id === 'execution-old-2') {
                    return {
                        id: 'execution-old-2',
                        threadId: 'thread-1',
                        checkpointNs: '',
                        checkpointId: 'checkpoint-loop-2',
                        inputs: {
                            input: 'Original prompt 2'
                        }
                    }
                }
            }
            if (query instanceof CopilotCheckpointGetTupleQuery) {
                switch (query.configurable.checkpoint_id) {
                    case 'checkpoint-loop-1':
                        return createCheckpointTuple('checkpoint-loop-1', 'loop', 'checkpoint-input-1')
                    case 'checkpoint-input-1':
                        return createCheckpointTuple('checkpoint-input-1', 'input', 'checkpoint-prev-1')
                    case 'checkpoint-loop-2':
                        return createCheckpointTuple('checkpoint-loop-2', 'loop', 'checkpoint-input-2')
                    case 'checkpoint-input-2':
                        return createCheckpointTuple('checkpoint-input-2', 'input', 'checkpoint-prev-2')
                    default:
                        return null
                }
            }
            return null
        })

        const stream = await handler.execute(
            new XpertChatCommand(
                {
                    action: 'retry',
                    conversationId: 'conversation-1',
                    source: {
                        aiMessageId: 'ai-1'
                    }
                },
                {
                    xpertId: 'xpert-1',
                    messageId: 'ai-1'
                } as any
            )
        )

        await lastValueFrom(stream.pipe(toArray()))

        const executionCommand = commands.find(
            (command) =>
                command instanceof XpertAgentExecutionUpsertCommand &&
                command.execution.status === XpertAgentExecutionStatusEnum.RUNNING
        ) as XpertAgentExecutionUpsertCommand
        expect(executionCommand.execution.inputs).toEqual({
            locale: 'zh-CN',
            input: 'Original prompt 1'
        })

        const agentCommand = commands.find(
            (command) => command instanceof XpertAgentChatCommand
        ) as XpertAgentChatCommand
        expect(agentCommand.options.checkpointId).toBe('checkpoint-input-1')
    })

    it('falls back to the retried human prompt when source execution inputs are empty', async () => {
        const commands: any[] = []
        commandBus.execute.mockImplementation(async (command) => {
            commands.push(command)

            if (command instanceof CreateMemoryStoreCommand) {
                return null
            }
            if (command instanceof ChatConversationUpsertCommand) {
                return {
                    id: 'conversation-1',
                    threadId: 'thread-1',
                    messages: [
                        {
                            id: 'human-1',
                            role: 'human',
                            content: 'Original prompt'
                        },
                        {
                            id: 'ai-1',
                            role: 'ai',
                            parentId: 'human-1',
                            content: 'Original answer',
                            executionId: 'execution-old',
                            status: XpertAgentExecutionStatusEnum.SUCCESS
                        }
                    ],
                    status: 'busy',
                    options: {
                        parameters: {
                            locale: 'zh-CN'
                        }
                    }
                }
            }
            if (command instanceof XpertAgentExecutionUpsertCommand) {
                if (command.execution.status === XpertAgentExecutionStatusEnum.RUNNING) {
                    return {
                        id: 'execution-new',
                        threadId: 'thread-1'
                    }
                }
                return command.execution
            }
            if (command instanceof ChatMessageUpsertCommand) {
                if (command.entity.role === 'ai' && command.entity.status === 'thinking') {
                    return {
                        id: 'ai-2',
                        ...command.entity
                    }
                }
                return command.entity
            }
            if (command instanceof XpertAgentChatCommand) {
                return of({
                    data: {
                        type: ChatMessageTypeEnum.EVENT,
                        event: ChatMessageEventTypeEnum.ON_AGENT_END,
                        data: {
                            id: 'execution-new',
                            status: XpertAgentExecutionStatusEnum.SUCCESS
                        }
                    }
                } as MessageEvent)
            }
            return null
        })
        queryBus.execute.mockImplementation(async (query) => {
            if (query instanceof XpertAgentExecutionOneQuery) {
                return {
                    id: 'execution-old',
                    threadId: 'thread-1',
                    checkpointNs: '',
                    checkpointId: 'checkpoint-loop-1',
                    inputs: {
                        temperature: 'low'
                    }
                }
            }
            if (query instanceof CopilotCheckpointGetTupleQuery) {
                switch (query.configurable.checkpoint_id) {
                    case 'checkpoint-loop-1':
                        return createCheckpointTuple('checkpoint-loop-1', 'loop', 'checkpoint-input-1')
                    case 'checkpoint-input-1':
                        return createCheckpointTuple('checkpoint-input-1', 'input', 'checkpoint-prev')
                    default:
                        return null
                }
            }
            return null
        })

        const stream = await handler.execute(
            new XpertChatCommand(
                {
                    action: 'retry',
                    conversationId: 'conversation-1',
                    source: {
                        aiMessageId: 'ai-1'
                    }
                },
                {
                    xpertId: 'xpert-1',
                    messageId: 'ai-1'
                } as any
            )
        )

        await lastValueFrom(stream.pipe(toArray()))

        const executionCommand = commands.find(
            (command) =>
                command instanceof XpertAgentExecutionUpsertCommand &&
                command.execution.status === XpertAgentExecutionStatusEnum.RUNNING
        ) as XpertAgentExecutionUpsertCommand
        expect(executionCommand.execution.inputs).toEqual({
            locale: 'zh-CN',
            input: 'Original prompt',
            temperature: 'low'
        })
    })

    it('extracts retry human input from a stored graph state payload', async () => {
        const commands: any[] = []
        commandBus.execute.mockImplementation(async (command) => {
            commands.push(command)

            if (command instanceof CreateMemoryStoreCommand) {
                return null
            }
            if (command instanceof ChatConversationUpsertCommand) {
                return {
                    id: 'conversation-1',
                    threadId: 'thread-1',
                    messages: [
                        {
                            id: 'human-1',
                            role: 'human',
                            content: 'Original prompt'
                        },
                        {
                            id: 'ai-1',
                            role: 'ai',
                            parentId: 'human-1',
                            content: 'Original answer',
                            executionId: 'execution-old',
                            status: XpertAgentExecutionStatusEnum.SUCCESS
                        }
                    ],
                    status: 'busy',
                    options: {
                        parameters: {
                            locale: 'zh-CN'
                        }
                    }
                }
            }
            if (command instanceof XpertAgentExecutionUpsertCommand) {
                if (command.execution.status === XpertAgentExecutionStatusEnum.RUNNING) {
                    return {
                        id: 'execution-new',
                        threadId: 'thread-1'
                    }
                }
                return command.execution
            }
            if (command instanceof ChatMessageUpsertCommand) {
                if (command.entity.role === 'ai' && command.entity.status === 'thinking') {
                    return {
                        id: 'ai-2',
                        ...command.entity
                    }
                }
                return command.entity
            }
            if (command instanceof XpertAgentChatCommand) {
                return of({
                    data: {
                        type: ChatMessageTypeEnum.EVENT,
                        event: ChatMessageEventTypeEnum.ON_AGENT_END,
                        data: {
                            id: 'execution-new',
                            status: XpertAgentExecutionStatusEnum.SUCCESS
                        }
                    }
                } as MessageEvent)
            }
            return null
        })
        queryBus.execute.mockImplementation(async (query) => {
            if (query instanceof XpertAgentExecutionOneQuery) {
                return {
                    id: 'execution-old',
                    threadId: 'thread-1',
                    checkpointNs: '',
                    checkpointId: 'checkpoint-loop-1',
                    inputs: {
                        human: {
                            input: '',
                            temperature: 'low'
                        }
                    }
                }
            }
            if (query instanceof CopilotCheckpointGetTupleQuery) {
                switch (query.configurable.checkpoint_id) {
                    case 'checkpoint-loop-1':
                        return createCheckpointTuple('checkpoint-loop-1', 'loop', 'checkpoint-input-1')
                    case 'checkpoint-input-1':
                        return createCheckpointTuple('checkpoint-input-1', 'input', 'checkpoint-prev')
                    default:
                        return null
                }
            }
            return null
        })

        const stream = await handler.execute(
            new XpertChatCommand(
                {
                    action: 'retry',
                    conversationId: 'conversation-1',
                    source: {
                        aiMessageId: 'ai-1'
                    }
                },
                {
                    xpertId: 'xpert-1',
                    messageId: 'ai-1'
                } as any
            )
        )

        await lastValueFrom(stream.pipe(toArray()))

        const executionCommand = commands.find(
            (command) =>
                command instanceof XpertAgentExecutionUpsertCommand &&
                command.execution.status === XpertAgentExecutionStatusEnum.RUNNING
        ) as XpertAgentExecutionUpsertCommand
        expect(executionCommand.execution.inputs).toEqual({
            locale: 'zh-CN',
            input: 'Original prompt',
            temperature: 'low'
        })
    })

    it('throws when retry checkpoint ancestry does not contain an input checkpoint', async () => {
        commandBus.execute.mockImplementation(async (command) => {
            if (command instanceof CreateMemoryStoreCommand) {
                return null
            }
            if (command instanceof ChatConversationUpsertCommand) {
                return {
                    id: 'conversation-1',
                    threadId: 'thread-1',
                    messages: [
                        {
                            id: 'human-1',
                            role: 'human',
                            content: 'Original prompt'
                        },
                        {
                            id: 'ai-1',
                            role: 'ai',
                            parentId: 'human-1',
                            content: 'Original answer',
                            executionId: 'execution-old',
                            status: XpertAgentExecutionStatusEnum.SUCCESS
                        }
                    ],
                    status: 'busy',
                    options: {
                        parameters: {
                            input: 'Original prompt'
                        }
                    }
                }
            }
            return null
        })
        queryBus.execute.mockImplementation(async (query) => {
            if (query instanceof XpertAgentExecutionOneQuery) {
                return {
                    id: 'execution-old',
                    threadId: 'thread-1',
                    checkpointNs: '',
                    checkpointId: 'checkpoint-loop-2',
                    inputs: {
                        input: 'Original prompt'
                    }
                }
            }
            if (query instanceof CopilotCheckpointGetTupleQuery) {
                switch (query.configurable.checkpoint_id) {
                    case 'checkpoint-loop-2':
                        return createCheckpointTuple('checkpoint-loop-2', 'loop', 'checkpoint-loop-1')
                    case 'checkpoint-loop-1':
                        return createCheckpointTuple('checkpoint-loop-1', 'loop')
                    default:
                        return null
                }
            }
            return null
        })

        await expect(
            handler.execute(
                new XpertChatCommand(
                    {
                        action: 'retry',
                        conversationId: 'conversation-1',
                        source: {
                            aiMessageId: 'ai-1'
                        }
                    },
                    {
                        xpertId: 'xpert-1',
                        messageId: 'ai-1'
                    } as any
                )
            )
        ).rejects.toThrow('Retry source input checkpoint not found')
    })
})

function createCheckpointTuple(checkpointId: string, source: 'input' | 'loop', parentId?: string) {
    return {
        config: {
            configurable: {
                thread_id: 'thread-1',
                checkpoint_ns: '',
                checkpoint_id: checkpointId
            }
        },
        checkpoint: {
            channel_values: {}
        },
        metadata: {
            source,
            step: source === 'input' ? -1 : 1,
            parents: {}
        },
        parentConfig: parentId
            ? {
                  configurable: {
                      thread_id: 'thread-1',
                      checkpoint_ns: '',
                      checkpoint_id: parentId
                  }
              }
            : undefined,
        pendingWrites: []
    }
}
