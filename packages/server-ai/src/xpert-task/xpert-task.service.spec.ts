import {
    IWFNMiddleware,
    IXpertTask,
    ScheduleTaskStatus,
    TaskFrequency,
    TXpertGraph,
    WorkflowNodeTypeEnum,
    XPERT_TASK_SCHEDULE_IDEMPOTENCY_KEY,
    XpertAgentExecutionStatusEnum
} from '@xpert-ai/contracts'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { SchedulerRegistry } from '@nestjs/schedule'
import { AgentMiddlewareRegistry } from '@xpert-ai/plugin-sdk'
import { Repository } from 'typeorm'
import { of } from 'rxjs'
import { ChatConversationUpsertCommand } from '../chat-conversation'
import { XpertAgentExecutionUpsertCommand } from '../xpert-agent-execution'
import { XpertChatCommand } from '../xpert/commands'
import { XpertService } from '../xpert/xpert.service'
import { AutoTask } from './auto-task.entity'
import { AutoTaskTemplate } from './auto-task-template.entity'
import { ChatConversation } from '../chat-conversation/conversation.entity'
import { ScheduleNote } from './schedule-note.entity'
import { XpertTask } from './xpert-task.entity'
import { XpertTaskTemplate } from './xpert-task-template.entity'
import { XpertTaskService } from './xpert-task.service'

type CommandBusMock = {
    execute: jest.Mock<Promise<unknown>, [unknown]>
}

type AgentMiddlewareRegistryMock = {
    get: jest.Mock
}

describe('XpertTaskService', () => {
    it('creates a joinable persisted chat run for scheduled task execution', async () => {
        const commandBus = createCommandBusMock()
        const service = createService(commandBus)
        jest.spyOn(service, 'findOne').mockResolvedValue(
            createTaskFixture({
                prompt: 'Run the automation',
                xpertId: 'xpert-1'
            })
        )

        const result = await service.executeTask('task-1', { timeZone: 'UTC' })

        expect(result).toEqual({
            conversationId: 'conversation-1',
            threadId: 'thread-1',
            runId: 'run-1'
        })

        const conversationCommand = findCommand(commandBus, ChatConversationUpsertCommand)
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

        const executionCommand = findCommand(commandBus, XpertAgentExecutionUpsertCommand)
        expect(executionCommand.execution).toMatchObject({
            xpertId: 'xpert-1',
            status: XpertAgentExecutionStatusEnum.RUNNING,
            threadId: 'thread-1'
        })

        const chatCommand = findCommand(commandBus, XpertChatCommand)
        expect(chatCommand.request).toMatchObject({
            action: 'send',
            conversationId: 'conversation-1',
            message: {
                input: {
                    input: 'Run the automation'
                }
            },
            state: {
                [XPERT_TASK_SCHEDULE_IDEMPOTENCY_KEY]: expect.stringMatching(/^xpert-task:task-1:/)
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

    it('injects configured task runtime state into scheduled task runs', async () => {
        const commandBus = createCommandBusMock()
        const service = createService(commandBus)
        jest.spyOn(service, 'findOne').mockResolvedValue(
            createTaskFixture({
                prompt: '生成今日早报',
                xpertId: 'xpert-1',
                runtimeState: {
                    xpert_task_uuid: 'uuid-1',
                    xpert_task_contact_id: 'room@chatroom',
                    xpert_task_chat_type: 'group'
                }
            })
        )

        await service.executeTask('task-1', { timeZone: 'UTC' })

        const chatCommand = findCommand(commandBus, XpertChatCommand)
        expect(chatCommand.request).toMatchObject({
            action: 'send',
            state: {
                xpert_task_uuid: 'uuid-1',
                xpert_task_contact_id: 'room@chatroom',
                xpert_task_chat_type: 'group',
                [XPERT_TASK_SCHEDULE_IDEMPOTENCY_KEY]: expect.stringMatching(/^xpert-task:task-1:/)
            }
        })
    })

    it('reports xpert_task-prefixed schedule runtime state schema from connected middleware', async () => {
        const commandBus = createCommandBusMock()
        const middlewareEntity: IWFNMiddleware = {
            id: 'middleware-1',
            type: WorkflowNodeTypeEnum.MIDDLEWARE,
            key: 'Middleware_ScheduleRuntime',
            title: 'Example Schedule Runtime Tools',
            provider: 'ExampleScheduleMiddleware',
            options: {}
        }
        const graph: TXpertGraph = {
            nodes: [
                {
                    type: 'agent',
                    key: 'Agent_primary',
                    position: { x: 0, y: 0 },
                    entity: {
                        key: 'Agent_primary',
                        name: 'primary'
                    }
                },
                {
                    type: 'workflow',
                    key: 'Middleware_ScheduleRuntime',
                    position: { x: 0, y: 0 },
                    entity: middlewareEntity
                }
            ],
            connections: [
                {
                    type: 'workflow',
                    key: 'Agent_primary/Middleware_ScheduleRuntime',
                    from: 'Agent_primary',
                    to: 'Middleware_ScheduleRuntime'
                }
            ]
        }
        const xpertService = createXpertServiceMock({
            id: 'xpert-1',
            graph,
            agent: {
                key: 'Agent_primary'
            },
            agentConfig: {
                stateVariables: [
                    {
                        name: 'dailyTopic',
                        type: 'string',
                        description: 'Daily topic'
                    },
                    {
                        name: 'currentDocumentId',
                        type: 'string',
                        description: 'Current document id'
                    }
                ]
            }
        })
        const agentMiddlewareRegistry = createAgentMiddlewareRegistryMock({
            ExampleScheduleMiddleware: createScheduleStateMiddlewareStrategy()
        })
        const service = createService(commandBus, xpertService, agentMiddlewareRegistry)

        const capabilities = await service.getScheduleCapabilities('xpert-1')

        expect(capabilities).toMatchObject({
            xpertId: 'xpert-1',
            agentKey: 'Agent_primary',
            stateVariables: [],
            stateSchema: {
                type: 'object',
                required: ['xpert_task_uuid'],
                properties: {
                    xpert_task_uuid: {
                        type: 'string',
                        title: 'wx2.0 Account UUID'
                    }
                }
            }
        })
        expect(capabilities.stateSchema?.properties).not.toHaveProperty('contact_id')
        expect(capabilities.stateSchema?.properties).not.toHaveProperty('dailyTopic')
    })

    it('strips read-only relation fields before updating a task', async () => {
        const commandBus = createCommandBusMock()
        const repository = createRepositoryMock<XpertTask>()
        const service = createService(commandBus, undefined, undefined, repository)
        jest.spyOn(service, 'findOne')
            .mockResolvedValueOnce(createTaskFixture())
            .mockResolvedValueOnce(createTaskFixture({ prompt: 'Updated prompt' }))
        jest.spyOn(service, 'rescheduleTask').mockImplementation()

        const updateInput = {
            prompt: 'Updated prompt',
            conversations: [
                {
                    id: 'conversation-1'
                }
            ],
            xpert: {
                id: 'xpert-1',
                conversations: [
                    {
                        id: 'xpert-conversation-1'
                    }
                ]
            },
            executionCount: 1
        } as unknown as Partial<IXpertTask>

        await service.updateTask('task-1', updateInput)

        const updatePayload = (repository.update as jest.Mock).mock.calls[0][1]
        expect(updatePayload).toMatchObject({
            id: 'task-1',
            prompt: 'Updated prompt'
        })
        expect(updatePayload).not.toHaveProperty('conversations')
        expect(updatePayload).not.toHaveProperty('xpert')
        expect(updatePayload).not.toHaveProperty('executionCount')
    })
})

function createService(
    commandBus: CommandBusMock,
    xpertService = createXpertServiceMock(),
    agentMiddlewareRegistry = createAgentMiddlewareRegistryMock(),
    repository = createRepositoryMock<XpertTask>()
) {
    return new XpertTaskService(
        repository,
        createRepositoryMock<ScheduleNote>(),
        createRepositoryMock<ChatConversation>(),
        createRepositoryMock<AutoTask>(),
        createRepositoryMock<AutoTaskTemplate>(),
        createRepositoryMock<XpertTaskTemplate>(),
        createSchedulerRegistryMock(),
        xpertService as unknown as XpertService,
        agentMiddlewareRegistry as unknown as AgentMiddlewareRegistry,
        commandBus as unknown as CommandBus,
        createQueryBusMock()
    )
}

function createAgentMiddlewareRegistryMock(strategies: Record<string, unknown> = {}): AgentMiddlewareRegistryMock {
    return {
        get: jest.fn((provider: string) => {
            const strategy = strategies[provider]
            if (!strategy) {
                throw new Error(`No strategy found for provider "${provider}"`)
            }
            return strategy
        })
    }
}

function createScheduleStateMiddlewareStrategy() {
    return {
        createMiddleware: jest.fn(async () => ({
            name: 'ExampleScheduleMiddleware',
            stateSchema: {
                type: 'object',
                required: ['xpert_task_uuid', 'contact_id'],
                properties: {
                    xpert_task_uuid: {
                        type: 'string',
                        description: 'wx2.0 Account UUID'
                    },
                    contact_id: {
                        type: 'string',
                        description: 'Regular runtime state, not schedule task configurable'
                    }
                }
            }
        })),
        meta: {
            configSchema: {
                type: 'object',
                properties: {
                    scheduleRuntime: {
                        type: 'object'
                    }
                }
            }
        }
    }
}

function createCommandBusMock(): CommandBusMock {
    return {
        execute: jest.fn(async (command: unknown) => {
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
            throw new Error(
                `Unexpected command: ${command instanceof Object ? command.constructor?.name : String(command)}`
            )
        })
    }
}

function findCommand<T>(commandBus: CommandBusMock, type: new (...args: never[]) => T): T {
    const command = commandBus.execute.mock.calls.map(([item]) => item).find((item) => item instanceof type)
    if (!command) {
        throw new Error(`Command not found: ${type.name}`)
    }
    return command as T
}

function createTaskFixture(overrides: Partial<IXpertTask> = {}) {
    const task: IXpertTask = {
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
        options: {
            frequency: TaskFrequency.Once,
            time: '08:00',
            date: '2026-06-17'
        },
        ...overrides
    }

    return task as unknown as XpertTask
}

function createRepositoryMock<T>() {
    return {
        find: jest.fn(),
        findOne: jest.fn(),
        create: jest.fn((entity: unknown) => entity),
        save: jest.fn(async (entity: unknown) => entity),
        remove: jest.fn(async (entity: unknown) => entity),
        delete: jest.fn(),
        update: jest.fn(),
        count: jest.fn(),
        createQueryBuilder: jest.fn()
    } as unknown as Repository<T>
}

function createSchedulerRegistryMock() {
    return {
        addCronJob: jest.fn(),
        getCronJob: jest.fn(),
        deleteCronJob: jest.fn()
    } as unknown as SchedulerRegistry
}

function createQueryBusMock() {
    return {
        execute: jest.fn()
    } as unknown as QueryBus
}

function createXpertServiceMock(xpert?: unknown) {
    return {
        findOne: jest.fn(async () => xpert ?? null)
    }
}
