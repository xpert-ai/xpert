import { of, lastValueFrom, toArray } from 'rxjs'
import { ChatMessageEventTypeEnum, ChatMessageTypeEnum, XpertAgentExecutionStatusEnum } from '@metad/contracts'
import { ChatConversationUpsertCommand } from '../../../chat-conversation/commands/upsert.command'
import { ChatMessageUpsertCommand } from '../../../chat-message/commands/upsert.command'
import { CopilotCheckpointGetTupleQuery } from '../../../copilot-checkpoint'
import { CreateMemoryStoreCommand } from '../../../shared'
import { XpertAgentChatCommand } from '../../../xpert-agent/commands/chat.command'
import { XpertAgentExecutionUpsertCommand } from '../../../xpert-agent-execution/commands/upsert.command'
import { XpertAgentExecutionOneQuery } from '../../../xpert-agent-execution/queries/get-one.query'
import { XpertChatCommand } from '../chat.command'
import { XpertChatHandler } from './chat.handler'

describe('XpertChatHandler', () => {
    let xpertService: { findOne: jest.Mock }
    let commandBus: { execute: jest.Mock }
    let queryBus: { execute: jest.Mock }
    let handler: XpertChatHandler

    const xpert = {
        id: 'xpert-1',
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
        commandBus = {
            execute: jest.fn()
        }
        queryBus = {
            execute: jest.fn()
        }

        handler = new XpertChatHandler(xpertService as any, commandBus as any, queryBus as any)
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
