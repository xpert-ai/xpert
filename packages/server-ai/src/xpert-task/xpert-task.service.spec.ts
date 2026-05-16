import { ScheduleTaskStatus, XpertAgentExecutionStatusEnum } from '@xpert-ai/contracts'
import { of } from 'rxjs'
import { ChatConversationUpsertCommand } from '../chat-conversation'
import { XpertAgentExecutionUpsertCommand } from '../xpert-agent-execution'
import { XpertChatCommand } from '../xpert/commands'
import { XpertTaskService } from './xpert-task.service'

describe('XpertTaskService', () => {
    it('creates a joinable persisted chat run for scheduled task execution', async () => {
        const commandBus = {
            execute: jest.fn(async (command) => {
                if (command instanceof ChatConversationUpsertCommand) {
                    return {
                        id: 'conversation-1',
                        threadId: 'thread-1'
                    }
                }
                if (command instanceof XpertAgentExecutionUpsertCommand) {
                    return {
                        id: 'run-1',
                        threadId: 'thread-1'
                    }
                }
                if (command instanceof XpertChatCommand) {
                    return of({
                        data: {
                            type: 'event'
                        }
                    } as MessageEvent)
                }
                throw new Error(`Unexpected command: ${command.constructor?.name}`)
            })
        }
        const service = new XpertTaskService(
            createRepositoryMock(),
            createRepositoryMock(),
            createRepositoryMock(),
            createRepositoryMock(),
            createRepositoryMock(),
            createRepositoryMock(),
            createSchedulerRegistryMock(),
            commandBus as any,
            {} as any
        )
        jest.spyOn(service, 'findOne').mockResolvedValue({
            id: 'task-1',
            tenantId: 'tenant-1',
            createdById: 'user-1',
            prompt: 'Run the automation',
            xpertId: 'xpert-1',
            timeZone: 'Asia/Shanghai',
            status: ScheduleTaskStatus.SCHEDULED,
            createdBy: {
                id: 'user-1'
            },
            options: {}
        } as any)

        const result = await service.executeTask('task-1', { timeZone: 'UTC' })

        expect(result).toEqual({
            conversationId: 'conversation-1',
            threadId: 'thread-1',
            runId: 'run-1'
        })

        const conversationCommand = commandBus.execute.mock.calls
            .map(([command]) => command)
            .find((command) => command instanceof ChatConversationUpsertCommand) as ChatConversationUpsertCommand
        expect(conversationCommand.entity).toMatchObject({
            status: 'busy',
            taskId: 'task-1',
            xpertId: 'xpert-1',
            options: {
                parameters: {
                    input: 'Run the automation'
                }
            },
            from: 'job'
        })

        const executionCommand = commandBus.execute.mock.calls
            .map(([command]) => command)
            .find((command) => command instanceof XpertAgentExecutionUpsertCommand) as XpertAgentExecutionUpsertCommand
        expect(executionCommand.execution).toMatchObject({
            xpert: {
                id: 'xpert-1'
            },
            status: XpertAgentExecutionStatusEnum.RUNNING,
            threadId: 'thread-1'
        })

        const chatCommand = commandBus.execute.mock.calls
            .map(([command]) => command)
            .find((command) => command instanceof XpertChatCommand) as XpertChatCommand
        expect(chatCommand.request).toEqual({
            action: 'send',
            conversationId: 'conversation-1',
            message: {
                input: {
                    input: 'Run the automation'
                }
            }
        })
        expect(chatCommand.options).toMatchObject({
            xpertId: 'xpert-1',
            timeZone: 'Asia/Shanghai',
            from: 'job',
            taskId: 'task-1',
            execution: {
                id: 'run-1'
            },
            streamPersistence: {
                transport: 'redis-stream',
                threadId: 'thread-1',
                runId: 'run-1'
            }
        })
    })
})

function createRepositoryMock() {
    return {
        find: jest.fn(),
        findOne: jest.fn(),
        create: jest.fn((entity) => entity),
        save: jest.fn(async (entity) => entity),
        remove: jest.fn(async (entity) => entity),
        delete: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
        createQueryBuilder: jest.fn()
    } as any
}

function createSchedulerRegistryMock() {
    return {
        addCronJob: jest.fn(),
        getCronJob: jest.fn(),
        deleteCronJob: jest.fn()
    } as any
}
