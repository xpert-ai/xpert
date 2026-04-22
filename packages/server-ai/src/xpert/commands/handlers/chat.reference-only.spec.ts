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

import { lastValueFrom, of, toArray } from 'rxjs'
import { ChatMessageEventTypeEnum, ChatMessageTypeEnum, XpertAgentExecutionStatusEnum } from '@xpert-ai/contracts'
import { ChatConversationUpsertCommand } from '../../../chat-conversation/commands/upsert.command'
import { ChatMessageUpsertCommand } from '../../../chat-message/commands/upsert.command'
import { CreateMemoryStoreCommand } from '../../../shared/commands/create-memory-store.command'
import { XpertAgentChatCommand } from '../../../xpert-agent/commands/chat.command'
import { XpertAgentExecutionUpsertCommand } from '../../../xpert-agent-execution/commands/upsert.command'
import { XpertChatCommand } from '../chat.command'
import { XpertChatHandler } from './chat.handler'

describe('XpertChatHandler reference-only inputs', () => {
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
                toolPreferences: null
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

    it('accepts reference-only follow-up inputs and persists their raw references', async () => {
        const commands: any[] = []
        commandBus.execute.mockImplementation(async (command) => {
            commands.push(command)
            return command instanceof ChatMessageUpsertCommand ? command.entity : null
        })
        queryBus.execute.mockResolvedValue({
            id: 'conversation-1',
            status: 'busy',
            messages: [
                {
                    id: 'ai-1',
                    role: 'ai',
                    executionId: 'execution-prev'
                }
            ]
        })

        const stream = await handler.execute(
            new XpertChatCommand(
                {
                    action: 'follow_up',
                    conversationId: 'conversation-1',
                    mode: 'queue',
                    message: {
                        clientMessageId: 'client-follow-up-1',
                        input: {
                            input: '',
                            referenceComposition: 'compose',
                            references: [
                                {
                                    type: 'quote',
                                    source: 'Pasted text',
                                    text: 'Long pasted content'
                                }
                            ]
                        }
                    }
                },
                {
                    xpertId: 'xpert-1'
                } as any
            )
        )

        await lastValueFrom(stream.pipe(toArray()))

        const followUpCommand = commands.find(
            (command) => command instanceof ChatMessageUpsertCommand
        ) as ChatMessageUpsertCommand

        expect(followUpCommand.entity).toEqual(
            expect.objectContaining({
                role: 'human',
                content: '',
                conversationId: 'conversation-1',
                followUpStatus: 'pending',
                references: [
                    {
                        type: 'quote',
                        source: 'Pasted text',
                        text: 'Long pasted content'
                    }
                ]
            })
        )
    })

    it('accepts reference-only send inputs while hydrating graph state for the agent', async () => {
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
                        clientMessageId: 'client-image-1',
                        input: {
                            input: '',
                            referenceComposition: 'compose',
                            references: [
                                {
                                    type: 'image',
                                    fileId: 'file-1',
                                    url: 'https://example.com/image.png',
                                    mimeType: 'image/png',
                                    name: 'diagram.png',
                                    text: 'Pasted image: diagram.png'
                                }
                            ]
                        }
                    }
                },
                {
                    xpertId: 'xpert-1'
                } as any
            )
        )

        await lastValueFrom(stream.pipe(toArray()))

        const humanMessageCommand = commands.find(
            (command) => command instanceof ChatMessageUpsertCommand && command.entity.role === 'human'
        ) as ChatMessageUpsertCommand
        expect(humanMessageCommand.entity).toEqual(
            expect.objectContaining({
                content: '',
                references: [
                    expect.objectContaining({
                        type: 'image',
                        fileId: 'file-1',
                        name: 'diagram.png'
                    })
                ]
            })
        )

        const agentCommand = commands.find(
            (command) => command instanceof XpertAgentChatCommand
        ) as XpertAgentChatCommand
        expect(agentCommand.state.human).toEqual(
            expect.objectContaining({
                input: expect.stringContaining('[Image] diagram.png'),
                referenceComposition: 'compose',
                references: [
                    expect.objectContaining({
                        type: 'image',
                        fileId: 'file-1',
                        name: 'diagram.png'
                    })
                ]
            })
        )
    })

    it('persists raw send input content instead of hydrated reference text from state', async () => {
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

        const quoteReference = {
            type: 'quote' as const,
            source: 'Pasted text',
            text: 'Long pasted content'
        }

        const stream = await handler.execute(
            new XpertChatCommand(
                {
                    action: 'send',
                    message: {
                        clientMessageId: 'client-quote-1',
                        input: {
                            input: 'Summarize this',
                            referenceComposition: 'compose',
                            references: [quoteReference]
                        }
                    },
                    state: {
                        human: {
                            input: 'Summarize this\n\n[Quote] Pasted text\nLong pasted content',
                            referenceComposition: 'compose',
                            references: [quoteReference]
                        }
                    }
                },
                {
                    xpertId: 'xpert-1'
                } as any
            )
        )

        await lastValueFrom(stream.pipe(toArray()))

        const humanMessageCommand = commands.find(
            (command) => command instanceof ChatMessageUpsertCommand && command.entity.role === 'human'
        ) as ChatMessageUpsertCommand
        expect(humanMessageCommand.entity).toEqual(
            expect.objectContaining({
                content: 'Summarize this',
                references: [quoteReference]
            })
        )

        const agentCommand = commands.find(
            (command) => command instanceof XpertAgentChatCommand
        ) as XpertAgentChatCommand
        expect(agentCommand.state.human).toEqual(
            expect.objectContaining({
                input: expect.stringContaining('Long pasted content'),
                references: [quoteReference]
            })
        )
    })

    it('persists raw follow-up input content instead of hydrated reference text from state', async () => {
        const commands: any[] = []
        commandBus.execute.mockImplementation(async (command) => {
            commands.push(command)
            return command instanceof ChatMessageUpsertCommand ? command.entity : null
        })
        queryBus.execute.mockResolvedValue({
            id: 'conversation-1',
            status: 'busy',
            messages: [
                {
                    id: 'ai-1',
                    role: 'ai',
                    executionId: 'execution-prev'
                }
            ]
        })

        const quoteReference = {
            type: 'quote' as const,
            source: 'Pasted text',
            text: 'Long pasted content'
        }

        const stream = await handler.execute(
            new XpertChatCommand(
                {
                    action: 'follow_up',
                    conversationId: 'conversation-1',
                    mode: 'queue',
                    message: {
                        clientMessageId: 'client-follow-up-2',
                        input: {
                            input: 'Please focus on section 2',
                            referenceComposition: 'compose',
                            references: [quoteReference]
                        }
                    },
                    state: {
                        human: {
                            input: 'Please focus on section 2\n\n[Quote] Pasted text\nLong pasted content',
                            referenceComposition: 'compose',
                            references: [quoteReference]
                        }
                    }
                },
                {
                    xpertId: 'xpert-1'
                } as any
            )
        )

        await lastValueFrom(stream.pipe(toArray()))

        const followUpCommand = commands.find(
            (command) => command instanceof ChatMessageUpsertCommand
        ) as ChatMessageUpsertCommand

        expect(followUpCommand.entity).toEqual(
            expect.objectContaining({
                role: 'human',
                content: 'Please focus on section 2',
                references: [quoteReference],
                thirdPartyMessage: expect.objectContaining({
                    followUpInput: expect.objectContaining({
                        input: 'Please focus on section 2',
                        references: [quoteReference]
                    })
                })
            })
        )
    })
})
