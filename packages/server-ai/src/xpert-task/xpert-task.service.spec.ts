import {
    IWFNMiddleware,
    IXpertTask,
    ScheduleTaskStatus,
    STATE_VARIABLE_HUMAN,
    TaskFrequency,
    TXpertGraph,
    UserType,
    WorkflowNodeTypeEnum,
    XPERT_TASK_SCHEDULE_IDEMPOTENCY_KEY,
    XpertAgentExecutionStatusEnum
} from '@xpert-ai/contracts'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { BadRequestException, ForbiddenException } from '@nestjs/common'
import { SchedulerRegistry } from '@nestjs/schedule'
import {
    OutboundActorTokenProvider,
    RedisLockRunResult,
    RedisLockService,
    RequestContext,
    User
} from '@xpert-ai/server-core'
import { AgentMiddlewareRegistry } from '@xpert-ai/plugin-sdk'
import { Brackets, Repository, UpdateResult } from 'typeorm'
import { of } from 'rxjs'
import { z } from 'zod'
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
import {
    buildProjectTaskRunAsConfigurationHash,
    buildScheduleOccurrenceKey,
    resolveScheduledOccurrence,
    XpertTaskService
} from './xpert-task.service'
import { ScheduledTaskExecution, ScheduledTaskExecutionStatus } from './scheduled-task-execution.entity'
import { XpertProjectAccessService } from '../xpert-project/services/project-access.service'
import { XpertProjectXpertBindingService } from '../xpert-project/services/project-xpert-binding.service'
import { XpertProject } from '../xpert-project/entities/project.entity'
import { PublishedXpertAccessService } from '../xpert/published-xpert-access.service'
import { ConnectorService } from '../connector/connector.service'
import type { RuntimeCapabilitiesSelection, TXpertChatState } from '@xpert-ai/chatkit-types'

type CommandBusMock = {
    execute: jest.Mock<Promise<unknown>, [unknown]>
}

type AgentMiddlewareRegistryMock = {
    get: jest.Mock
}

describe('XpertTaskService', () => {
    afterEach(() => {
        jest.restoreAllMocks()
    })

    it('immediately removes in-memory jobs when a Project run-as member is removed', async () => {
        const repository = createRepositoryMock<XpertTask>()
        const tasks = [
            createTaskFixture({ id: 'task-run-as', projectId: 'project-1', runAsUserId: 'user-2' }),
            createTaskFixture({
                id: 'task-legacy',
                projectId: 'project-1',
                runAsUserId: undefined,
                createdById: 'user-2'
            })
        ]
        jest.mocked(repository.find).mockResolvedValue(tasks)
        const service = createService(createCommandBusMock(), undefined, undefined, repository)
        const deleteJob = jest.spyOn(service, 'deleteJob').mockImplementation()

        await service.pauseProjectTasksForRemovedMember({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            projectId: 'project-1',
            userId: 'user-2'
        })

        expect(deleteJob).toHaveBeenCalledTimes(2)
        expect(deleteJob).toHaveBeenCalledWith('task-run-as')
        expect(deleteJob).toHaveBeenCalledWith('task-legacy')
        expect(repository.update).toHaveBeenNthCalledWith(
            1,
            'task-run-as',
            expect.objectContaining({
                status: ScheduleTaskStatus.PAUSED,
                statusReason: expect.any(String)
            })
        )
        expect(repository.update).toHaveBeenNthCalledWith(
            2,
            'task-legacy',
            expect.objectContaining({
                status: ScheduleTaskStatus.PAUSED,
                statusReason: expect.any(String)
            })
        )
    })

    it('immediately removes in-memory jobs when a Project Xpert is removed', async () => {
        const repository = createRepositoryMock<XpertTask>()
        const tasks = [
            createTaskFixture({ id: 'task-current', projectId: 'project-1', xpertId: 'xpert-current' }),
            createTaskFixture({
                id: 'task-archived',
                projectId: 'project-1',
                xpertId: 'xpert-old',
                status: ScheduleTaskStatus.ARCHIVED
            })
        ]
        jest.mocked(repository.find).mockResolvedValue(tasks)
        const service = createService(createCommandBusMock(), undefined, undefined, repository)
        const deleteJob = jest.spyOn(service, 'deleteJob').mockImplementation()

        await service.pauseProjectTasksForRemovedXpert({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            projectId: 'project-1',
            xpertIds: ['xpert-current', 'xpert-old']
        })

        expect(repository.find).toHaveBeenCalledWith({
            where: {
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                projectId: 'project-1',
                xpertId: expect.anything()
            }
        })
        expect(deleteJob).toHaveBeenCalledWith('task-current')
        expect(deleteJob).not.toHaveBeenCalledWith('task-archived')
        expect(repository.update).toHaveBeenCalledTimes(1)
        expect(repository.update).toHaveBeenCalledWith(
            'task-current',
            expect.objectContaining({ status: ScheduleTaskStatus.PAUSED, statusReason: expect.any(String) })
        )
    })

    it('scans due auto tasks under a renewable Redis lock', async () => {
        const autoTaskQuery = {
            leftJoinAndSelect: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            take: jest.fn().mockReturnThis(),
            getMany: jest.fn().mockResolvedValue([])
        }
        const autoTaskRepository = createRepositoryMock<AutoTask>()
        jest.mocked(autoTaskRepository.createQueryBuilder).mockReturnValue(autoTaskQuery as never)
        const redisLockService = createRedisLockServiceMock()
        const service = createService(createCommandBusMock(), undefined, undefined, undefined, undefined, {
            autoTaskRepository,
            redisLockService
        })

        await service.runDueAutoTasks()

        expect(autoTaskQuery.getMany).toHaveBeenCalledTimes(1)
        expect(redisLockService.runWithLock).toHaveBeenCalledWith(
            'scheduler:xpert-auto-task',
            5 * 60 * 1000,
            expect.any(Function)
        )
    })

    it('restores an archived task as paused without scheduling it', async () => {
        const service = createService(createCommandBusMock())
        const task = createTaskFixture({ status: ScheduleTaskStatus.ARCHIVED })
        jest.spyOn(service, 'findOne').mockResolvedValue(task)
        const deleteJob = jest.spyOn(service, 'deleteJob').mockImplementation()
        const update = jest.spyOn(service, 'update').mockResolvedValue(new UpdateResult())

        await service.unarchive(task.id)

        expect(deleteJob).toHaveBeenCalledWith(task.id)
        expect(update).toHaveBeenCalledWith(task.id, { status: ScheduleTaskStatus.PAUSED })
    })

    it('builds one occurrence key for a normalized scheduled slot', () => {
        const task = createTaskFixture({
            options: {
                frequency: TaskFrequency.Daily,
                time: '09:50'
            }
        })
        const scheduledAt = resolveScheduledOccurrence(task, new Date('2026-08-19T01:52:30.000Z'))

        expect(buildScheduleOccurrenceKey(task, scheduledAt)).toBe('xpert-task:task-1:2026-08-19T01:50')
    })

    it('reclaims an expired scheduled execution through the periodic recovery scan', async () => {
        const commandBus = createCommandBusMock()
        const repository = createRepositoryMock<XpertTask>()
        const task = createTaskFixture()
        const expiredExecution = {
            id: 'scheduled-execution-1',
            taskId: task.id,
            tenantId: task.tenantId,
            organizationId: task.organizationId,
            occurrenceKey: 'xpert-task:task-1:2026-08-19T01:50',
            scheduledAt: new Date('2026-08-19T01:50:00.000Z'),
            status: ScheduledTaskExecutionStatus.RUNNING,
            ownerId: 'api-1',
            leaseExpiresAt: new Date('2026-08-19T01:55:00.000Z'),
            attempt: 1,
            conversationId: 'conversation-1',
            executionId: 'run-1'
        } as ScheduledTaskExecution
        const taskQuery = {
            leftJoinAndSelect: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            getOne: jest.fn().mockResolvedValue(task)
        }
        const createQueryBuilder = repository.createQueryBuilder as jest.Mock
        createQueryBuilder.mockReturnValue(taskQuery)
        const service = createService(commandBus, undefined, undefined, repository)
        const coordinator = {
            findExpired: jest.fn().mockResolvedValue([expiredExecution]),
            claim: jest.fn().mockResolvedValue(expiredExecution)
        }
        Reflect.set(service, 'scheduledTaskExecutionCoordinator', coordinator)
        const executeTask = jest.spyOn(service, 'executeTask').mockResolvedValue({
            conversationId: 'conversation-1',
            threadId: 'thread-1',
            runId: 'run-1'
        })

        await service.recoverExpiredScheduledTaskExecutions()

        expect(coordinator.claim).toHaveBeenCalledWith(
            task,
            expiredExecution.occurrenceKey,
            expiredExecution.scheduledAt
        )
        expect(executeTask).toHaveBeenCalledWith(
            task.id,
            { timeZone: task.timeZone },
            expiredExecution.scheduledAt,
            expiredExecution
        )
    })

    it('pauses a once task after its scheduled execution succeeds', async () => {
        const commandBus = createCommandBusMock()
        const repository = createRepositoryMock<XpertTask>()
        const task = createTaskFixture()
        const scheduledExecution = {
            id: 'scheduled-execution-1',
            taskId: task.id,
            occurrenceKey: 'xpert-task:task-1:2026-08-19T01:50',
            scheduledAt: new Date('2026-08-19T01:50:00.000Z'),
            status: ScheduledTaskExecutionStatus.PENDING,
            ownerId: 'api-1',
            leaseExpiresAt: new Date('2026-08-19T01:55:00.000Z'),
            attempt: 1,
            conversationId: 'conversation-1',
            executionId: 'run-1'
        } as ScheduledTaskExecution
        const service = createService(commandBus, undefined, undefined, repository)
        jest.spyOn(service, 'findOne').mockResolvedValue(task)
        const coordinator = {
            markRunning: jest.fn().mockResolvedValue(undefined),
            bindRun: jest.fn().mockResolvedValue(undefined),
            refreshLease: jest.fn().mockResolvedValue(undefined),
            finish: jest.fn().mockResolvedValue(undefined)
        }
        Reflect.set(service, 'scheduledTaskExecutionCoordinator', coordinator)

        await service.executeTask('task-1', { timeZone: 'UTC' }, scheduledExecution.scheduledAt, scheduledExecution)
        await new Promise<void>((resolve) => setImmediate(resolve))

        expect(coordinator.finish).toHaveBeenCalledWith(
            scheduledExecution,
            ScheduledTaskExecutionStatus.SUCCEEDED,
            undefined
        )
        expect(repository.update).toHaveBeenCalledWith(task.id, { status: ScheduleTaskStatus.PAUSED })
    })

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

    it('locks a Project task run to its Project and confirmed run-as user', async () => {
        const commandBus = createCommandBusMock()
        const projectAccess = {
            assertCanUseXpert: jest.fn().mockResolvedValue({ project: { id: 'project-1' }, role: 'member' })
        }
        const publishedXpertAccess = {
            getAccessiblePublishedXpert: jest.fn().mockResolvedValue({ id: 'xpert-1' })
        }
        const service = createService(commandBus, undefined, undefined, undefined, undefined, {
            projectAccess,
            publishedXpertAccess
        })
        jest.spyOn(service, 'findOne').mockResolvedValue(
            createTaskFixture({
                projectId: 'project-1',
                runAsUserId: 'user-2',
                runAsUser: { id: 'user-2' }
            })
        )

        await service.executeTask('task-1', { timeZone: 'UTC' })

        expect(projectAccess.assertCanUseXpert).toHaveBeenCalledWith('project-1', 'xpert-1')
        expect(publishedXpertAccess.getAccessiblePublishedXpert).toHaveBeenCalledWith('xpert-1')
        expect(findCommand(commandBus, ChatConversationUpsertCommand).entity).toMatchObject({
            projectId: 'project-1'
        })
        expect(findCommand(commandBus, XpertChatCommand).options).toMatchObject({
            projectId: 'project-1'
        })
    })

    it('runs a Project automation with the current Xpert version', async () => {
        const commandBus = createCommandBusMock()
        const connectorService = {
            resolveSelectedRuntimeBindings: jest.fn().mockResolvedValue([])
        }
        const outboundActorTokenProvider = {
            mint: jest.fn().mockReturnValue({ token: 'current-xpert-token' })
        }
        const projectAccess = {
            assertCanUseXpert: jest.fn().mockResolvedValue({ project: { id: 'project-1' }, role: 'member' })
        }
        const publishedXpertAccess = {
            getAccessiblePublishedXpert: jest.fn().mockResolvedValue({ id: 'xpert-current' })
        }
        const projectXpertBinding = {
            resolveCurrentById: jest.fn().mockResolvedValue({ id: 'xpert-current' })
        }
        const service = createService(commandBus, undefined, undefined, undefined, undefined, {
            projectAccess,
            publishedXpertAccess,
            projectXpertBinding,
            connectorService,
            outboundActorTokenProvider
        })
        jest.spyOn(service, 'findOne').mockResolvedValue(
            createTaskFixture({
                projectId: 'project-1',
                xpertId: 'xpert-history',
                runAsUserId: 'user-1',
                runtimeState: createConnectorRuntimeState(['binding-1']),
                options: {
                    frequency: TaskFrequency.Daily,
                    time: '08:00',
                    automationContext: {
                        source: 'project',
                        oidcClientId: 'project-automation'
                    }
                } as IXpertTask['options']
            })
        )

        await service.executeTask('task-1', { timeZone: 'UTC' })

        expect(projectXpertBinding.resolveCurrentById).toHaveBeenCalledWith('xpert-history', {
            tenantId: 'tenant-1',
            organizationId: null
        })
        expect(projectAccess.assertCanUseXpert).toHaveBeenCalledWith('project-1', 'xpert-current')
        expect(publishedXpertAccess.getAccessiblePublishedXpert).toHaveBeenCalledWith('xpert-current')
        expect(connectorService.resolveSelectedRuntimeBindings).toHaveBeenCalledWith(
            ['binding-1'],
            expect.objectContaining({ xpertId: 'xpert-current' })
        )
        expect(outboundActorTokenProvider.mint).toHaveBeenCalledWith(
            expect.objectContaining({
                act: expect.objectContaining({ xpert_id: 'xpert-current' })
            })
        )
        expect(findCommand(commandBus, ChatConversationUpsertCommand).entity).toMatchObject({
            projectId: 'project-1',
            xpertId: 'xpert-current'
        })
        expect(findCommand(commandBus, XpertAgentExecutionUpsertCommand).execution).toMatchObject({
            xpertId: 'xpert-current'
        })
        expect(findCommand(commandBus, XpertChatCommand).options).toMatchObject({
            projectId: 'project-1',
            xpertId: 'xpert-current',
            context: {
                env: {
                    oidc_token: 'current-xpert-token'
                }
            }
        })
    })

    it('pauses a Project automation when its current Xpert cannot be resolved', async () => {
        const commandBus = createCommandBusMock()
        const repository = createRepositoryMock<XpertTask>()
        const service = createService(commandBus, undefined, undefined, repository, undefined, {
            projectAccess: {
                assertCanUseXpert: jest.fn()
            },
            publishedXpertAccess: {
                getAccessiblePublishedXpert: jest.fn()
            },
            projectXpertBinding: {
                resolveCurrentById: jest.fn().mockResolvedValue(null)
            }
        })
        jest.spyOn(service, 'findOne').mockResolvedValue(
            createTaskFixture({
                projectId: 'project-1',
                xpertId: 'xpert-history',
                runAsUserId: 'user-1'
            })
        )

        await expect(service.executeTask('task-1', { timeZone: 'UTC' })).rejects.toBeInstanceOf(BadRequestException)

        expect(repository.update).toHaveBeenCalledWith(
            'task-1',
            expect.objectContaining({
                status: ScheduleTaskStatus.PAUSED,
                statusReason: expect.any(String)
            })
        )
        expect(
            commandBus.execute.mock.calls.some(([command]) => command instanceof ChatConversationUpsertCommand)
        ).toBe(false)
        expect(commandBus.execute.mock.calls.some(([command]) => command instanceof XpertChatCommand)).toBe(false)
    })

    it('pauses a Project task with a visible reason when runtime access is lost', async () => {
        const repository = createRepositoryMock<XpertTask>()
        const projectAccess = {
            assertCanUseXpert: jest.fn().mockRejectedValue(new Error('Project membership was revoked'))
        }
        const service = createService(createCommandBusMock(), undefined, undefined, repository, undefined, {
            projectAccess,
            publishedXpertAccess: {
                getAccessiblePublishedXpert: jest.fn()
            }
        })
        jest.spyOn(service, 'findOne').mockResolvedValue(
            createTaskFixture({
                projectId: 'project-1',
                runAsUserId: 'user-1',
                runAsUser: { id: 'user-1' }
            })
        )

        await expect(service.executeTask('task-1', { timeZone: 'UTC' })).rejects.toThrow(
            'Project membership was revoked'
        )

        expect(repository.update).toHaveBeenCalledWith('task-1', {
            status: ScheduleTaskStatus.PAUSED,
            statusReason: 'Project membership was revoked'
        })
    })

    it('preflights selected Project Connectors before creating the task conversation', async () => {
        const commandBus = createCommandBusMock()
        const connectorService = {
            resolveSelectedRuntimeBindings: jest
                .fn()
                .mockResolvedValue([{ bindingId: 'binding-1', provider: 'example' }])
        }
        const service = createService(commandBus, undefined, undefined, undefined, undefined, {
            projectAccess: {
                assertCanUseXpert: jest.fn().mockResolvedValue({ project: { id: 'project-1' }, role: 'member' })
            },
            publishedXpertAccess: {
                getAccessiblePublishedXpert: jest.fn().mockResolvedValue({ id: 'xpert-1' })
            },
            connectorService
        })
        jest.spyOn(service, 'findOne').mockResolvedValue(
            createTaskFixture({
                projectId: 'project-1',
                runAsUserId: 'user-1',
                runtimeState: createConnectorRuntimeState(['binding-1'])
            })
        )

        await service.executeTask('task-1', { timeZone: 'UTC' })

        expect(connectorService.resolveSelectedRuntimeBindings).toHaveBeenCalledWith(
            ['binding-1'],
            expect.objectContaining({
                tenantId: 'tenant-1',
                userId: 'user-1',
                projectId: 'project-1',
                xpertId: 'xpert-1',
                conversationId: expect.any(String),
                executionId: expect.any(String),
                connectorBindingIds: ['binding-1']
            })
        )
        const connectorPreflightOrder = connectorService.resolveSelectedRuntimeBindings.mock.invocationCallOrder[0]
        const conversationCreateOrder = commandBus.execute.mock.invocationCallOrder.find(
            (_, index) => commandBus.execute.mock.calls[index][0] instanceof ChatConversationUpsertCommand
        )
        expect(conversationCreateOrder).toBeDefined()
        expect(connectorPreflightOrder).toBeLessThan(conversationCreateOrder ?? 0)

        const runtimeScope = connectorService.resolveSelectedRuntimeBindings.mock.calls[0][1]
        expect(findCommand(commandBus, ChatConversationUpsertCommand).entity).toMatchObject({
            id: runtimeScope.conversationId
        })
        expect(findCommand(commandBus, XpertAgentExecutionUpsertCommand).execution).toMatchObject({
            id: runtimeScope.executionId
        })
    })

    it('pauses a Project task before conversation creation when a selected Connector becomes unavailable', async () => {
        const commandBus = createCommandBusMock()
        const repository = createRepositoryMock<XpertTask>()
        const connectorService = {
            resolveSelectedRuntimeBindings: jest
                .fn()
                .mockRejectedValue(new Error('Personal Connector grant was revoked'))
        }
        const service = createService(commandBus, undefined, undefined, repository, undefined, {
            projectAccess: {
                assertCanUseXpert: jest.fn().mockResolvedValue({ project: { id: 'project-1' }, role: 'member' })
            },
            publishedXpertAccess: {
                getAccessiblePublishedXpert: jest.fn().mockResolvedValue({ id: 'xpert-1' })
            },
            connectorService
        })
        jest.spyOn(service, 'findOne').mockResolvedValue(
            createTaskFixture({
                projectId: 'project-1',
                runAsUserId: 'user-1',
                runtimeState: createConnectorRuntimeState(['binding-1'])
            })
        )

        await expect(service.executeTask('task-1', { timeZone: 'UTC' })).rejects.toThrow(
            'Project automation was paused because a selected Connector is unavailable'
        )

        expect(repository.update).toHaveBeenCalledWith('task-1', {
            status: ScheduleTaskStatus.PAUSED,
            statusReason:
                'Project automation was paused because a selected Connector is unavailable: Personal Connector grant was revoked'
        })
        expect(
            commandBus.execute.mock.calls.some(([command]) => command instanceof ChatConversationUpsertCommand)
        ).toBe(false)
    })

    it('pauses a Project task when its confirmed run-as user no longer exists', async () => {
        const repository = createRepositoryMock<XpertTask>()
        const service = createService(createCommandBusMock(), undefined, undefined, repository)
        jest.spyOn(service, 'findOne').mockResolvedValue(
            createTaskFixture({
                projectId: 'project-1',
                runAsUserId: 'missing-user',
                runAsUser: undefined,
                createdBy: undefined
            })
        )

        await expect(service.executeTask('task-1', { timeZone: 'UTC' })).rejects.toThrow()

        expect(repository.update).toHaveBeenCalledWith('task-1', {
            status: ScheduleTaskStatus.PAUSED,
            statusReason: 'The scheduled task no longer has a valid run-as user'
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
                        title: {
                            en_US: 'wx2.0 Account UUID',
                            zh_Hans: 'wx2.0 账号 UUID'
                        },
                        'x-ui': {
                            component: 'remoteSelect'
                        }
                    },
                    xpert_task_chat_type: {
                        type: 'string',
                        enum: ['private', 'group'],
                        title: {
                            en_US: 'Chat Type',
                            zh_Hans: '会话类型'
                        },
                        'x-ui': {
                            enumLabels: {
                                group: {
                                    zh_Hans: '群聊'
                                }
                            }
                        }
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
            projectId: 'another-project',
            runAsUserId: 'another-user',
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
        expect(updatePayload).not.toHaveProperty('projectId')
        expect(updatePayload).not.toHaveProperty('runAsUserId')
    })

    it('requires Project manager access before updating a Project automation', async () => {
        const repository = createRepositoryMock<XpertTask>()
        const projectAccess = {
            assertCanManage: jest.fn().mockRejectedValue(new Error('Project manager access is required')),
            assertCanUseXpert: jest.fn()
        }
        const service = createService(createCommandBusMock(), undefined, undefined, repository, undefined, {
            projectAccess,
            publishedXpertAccess: {
                getAccessiblePublishedXpert: jest.fn()
            }
        })
        jest.spyOn(service, 'findOne').mockResolvedValue(createTaskFixture({ projectId: 'project-1' }))

        await expect(service.updateTask('task-1', { prompt: 'Changed' })).rejects.toThrow(
            'Project manager access is required'
        )

        expect(projectAccess.assertCanManage).toHaveBeenCalledWith('project-1')
        expect(repository.update).not.toHaveBeenCalled()
    })

    it('validates edited Connector selections as the confirmed run-as user before saving', async () => {
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-2')
        const repository = createRepositoryMock<XpertTask>()
        const userRepository = createRepositoryMock<User>()
        const runAsUser = { id: 'user-2', tenantId: 'tenant-1' } as User
        jest.mocked(userRepository.findOne).mockResolvedValue(runAsUser)
        const connectorService = {
            listBindings: jest.fn().mockResolvedValue([
                { id: 'binding-1', authorizationMode: 'personal' },
                { id: 'binding-2', authorizationMode: 'personal' }
            ]),
            resolveSelectedRuntimeBindings: jest.fn().mockRejectedValue(new Error('Personal grant is missing'))
        }
        const projectAccess = {
            assertCanManage: jest.fn().mockResolvedValue({ project: { id: 'project-1' }, role: 'manager' }),
            assertCanUseXpert: jest.fn().mockResolvedValue({ project: { id: 'project-1' }, role: 'member' })
        }
        const service = createService(createCommandBusMock(), undefined, undefined, repository, undefined, {
            projectAccess,
            publishedXpertAccess: {
                getAccessiblePublishedXpert: jest.fn().mockResolvedValue({ id: 'xpert-1' })
            },
            connectorService,
            userRepository
        })
        jest.spyOn(service, 'findOne').mockResolvedValue(
            createTaskFixture({
                projectId: 'project-1',
                organizationId: 'org-1',
                runAsUserId: runAsUser.id,
                runtimeState: createConnectorRuntimeState(['binding-1'])
            })
        )

        await expect(
            service.updateTask('task-1', { runtimeState: createConnectorRuntimeState(['binding-2']) })
        ).rejects.toThrow('A selected Connector is not available to the run-as user')

        expect(connectorService.resolveSelectedRuntimeBindings).toHaveBeenCalledWith(
            ['binding-2'],
            expect.objectContaining({
                userId: runAsUser.id,
                projectId: 'project-1',
                xpertId: 'xpert-1',
                connectorBindingIds: ['binding-2']
            })
        )
        expect(repository.update).not.toHaveBeenCalled()
    })

    it('does not let a Project manager change another run-as users personal Connector selection', async () => {
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('manager-1')
        const repository = createRepositoryMock<XpertTask>()
        const connectorService = {
            listBindings: jest.fn().mockResolvedValue([
                { id: 'binding-1', authorizationMode: 'personal' },
                { id: 'binding-2', authorizationMode: 'personal' }
            ]),
            resolveSelectedRuntimeBindings: jest.fn()
        }
        const service = createService(createCommandBusMock(), undefined, undefined, repository, undefined, {
            projectAccess: {
                assertCanManage: jest.fn().mockResolvedValue({ project: { id: 'project-1' }, role: 'manager' })
            },
            publishedXpertAccess: { getAccessiblePublishedXpert: jest.fn() },
            connectorService
        })
        jest.spyOn(service, 'findOne').mockResolvedValue(
            createTaskFixture({
                projectId: 'project-1',
                runAsUserId: 'user-2',
                runtimeState: createConnectorRuntimeState(['binding-1'])
            })
        )

        await expect(
            service.updateTask('task-1', { runtimeState: createConnectorRuntimeState(['binding-2']) })
        ).rejects.toThrow('Only the confirmed run-as user can change personal Connectors')

        expect(connectorService.resolveSelectedRuntimeBindings).not.toHaveBeenCalled()
        expect(repository.update).not.toHaveBeenCalled()
    })

    it('does not let a non-manager run-as user change non-Connector runtime capabilities', async () => {
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-2')
        const repository = createRepositoryMock<XpertTask>()
        const userRepository = createRepositoryMock<User>()
        jest.mocked(userRepository.findOne).mockResolvedValue({ id: 'user-2', tenantId: 'tenant-1' } as User)
        const projectAccess = {
            assertCanManage: jest.fn().mockRejectedValue(new Error('Project manager access is required')),
            assertCanUseXpert: jest.fn().mockResolvedValue({ project: { id: 'project-1' }, role: 'member' })
        }
        const connectorService = {
            listBindings: jest.fn().mockResolvedValue([
                { id: 'binding-1', authorizationMode: 'personal' },
                { id: 'binding-2', authorizationMode: 'personal' }
            ]),
            resolveSelectedRuntimeBindings: jest.fn().mockResolvedValue([])
        }
        const service = createService(createCommandBusMock(), undefined, undefined, repository, undefined, {
            projectAccess,
            publishedXpertAccess: {
                getAccessiblePublishedXpert: jest.fn().mockResolvedValue({ id: 'xpert-1' })
            },
            connectorService,
            userRepository
        })
        jest.spyOn(service, 'findOne').mockResolvedValue(
            createTaskFixture({
                projectId: 'project-1',
                organizationId: 'org-1',
                runAsUserId: 'user-2',
                runtimeState: createInheritedConnectorRuntimeState(['binding-1'])
            })
        )

        await expect(
            service.updateTask('task-1', {
                runtimeState: createInheritedConnectorRuntimeState(['binding-2'], {
                    recommended: {
                        skills: { ids: ['skill-not-approved-by-manager'] },
                        plugins: { nodeKeys: [] },
                        subAgents: { nodeKeys: [] }
                    }
                })
            })
        ).rejects.toThrow('Project manager access is required')

        expect(connectorService.resolveSelectedRuntimeBindings).not.toHaveBeenCalled()
        expect(repository.update).not.toHaveBeenCalled()
    })

    it('rejects a configuration update when run-as acceptance wins the proposal CAS race', async () => {
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('manager-1')
        const repository = createRepositoryMock<XpertTask>()
        jest.mocked(repository.update).mockResolvedValue(Object.assign(new UpdateResult(), { affected: 0 }))
        const userRepository = createRepositoryMock<User>()
        jest.mocked(userRepository.findOne).mockResolvedValue({ id: 'user-1', tenantId: 'tenant-1' } as User)
        const projectAccess = {
            assertCanManage: jest.fn().mockResolvedValue({ project: { id: 'project-1' }, role: 'manager' }),
            assertCanUseXpert: jest.fn().mockResolvedValue({ project: { id: 'project-1' }, role: 'member' })
        }
        const connectorService = {
            listBindings: jest.fn().mockResolvedValue([
                { id: 'binding-1', authorizationMode: 'shared' },
                { id: 'binding-2', authorizationMode: 'shared' }
            ]),
            resolveSelectedRuntimeBindings: jest.fn().mockResolvedValue([])
        }
        const service = createService(createCommandBusMock(), undefined, undefined, repository, undefined, {
            projectAccess,
            publishedXpertAccess: {
                getAccessiblePublishedXpert: jest.fn().mockResolvedValue({ id: 'xpert-1' })
            },
            connectorService,
            userRepository
        })
        const task = createTaskFixture({
            projectId: 'project-1',
            organizationId: 'org-1',
            runAsUserId: 'user-1',
            pendingRunAsUserId: 'user-2',
            runtimeState: createConnectorRuntimeState(['binding-1'])
        })
        jest.spyOn(service, 'findOne').mockResolvedValue(task)

        await expect(
            service.updateTask('task-1', { runtimeState: createConnectorRuntimeState(['binding-2']) })
        ).rejects.toThrow('The run-as transfer changed before it could be accepted')

        expect(repository.update).toHaveBeenCalledTimes(1)
        expect(repository.update).toHaveBeenCalledWith(
            {
                id: 'task-1',
                pendingRunAsUserId: 'user-2',
                pendingRunAsConfigurationHash: task.pendingRunAsConfigurationHash
            },
            {
                pendingRunAsUserId: null,
                pendingRunAsRequestedById: null,
                pendingRunAsRequestedAt: null,
                pendingRunAsConfigurationHash: null
            }
        )
    })

    it('lets the current run-as user propose a qualified Project member without changing the active identity', async () => {
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-1')
        const repository = createRepositoryMock<XpertTask>()
        const userRepository = createRepositoryMock<User>()
        const nextUser = { id: 'user-2', tenantId: 'tenant-1' } as User
        jest.mocked(userRepository.findOne).mockResolvedValue(nextUser)
        const projectAccess = {
            assertCanUse: jest.fn().mockResolvedValue({ project: { id: 'project-1' }, role: 'member' }),
            assertCanManage: jest.fn(),
            assertCanUseXpert: jest.fn().mockResolvedValue({ project: { id: 'project-1' }, role: 'member' })
        }
        const publishedXpertAccess = {
            getAccessiblePublishedXpert: jest.fn().mockResolvedValue({ id: 'xpert-1' })
        }
        const service = createService(createCommandBusMock(), undefined, undefined, repository, undefined, {
            projectAccess,
            publishedXpertAccess,
            userRepository
        })
        const task = createTaskFixture({
            projectId: 'project-1',
            organizationId: 'org-1',
            runAsUserId: 'user-1'
        })
        jest.spyOn(service, 'findOne').mockResolvedValue(task)

        const result = await service.proposeProjectTaskRunAs('task-1', 'user-2')

        expect(projectAccess.assertCanUse).toHaveBeenCalledWith('project-1')
        expect(projectAccess.assertCanManage).not.toHaveBeenCalled()
        expect(projectAccess.assertCanUseXpert).toHaveBeenCalledWith('project-1', 'xpert-1', {
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            userId: 'user-2'
        })
        expect(publishedXpertAccess.getAccessiblePublishedXpert).toHaveBeenCalledWith('xpert-1')
        expect(repository.update).toHaveBeenCalledWith('task-1', {
            pendingRunAsUserId: 'user-2',
            pendingRunAsRequestedById: 'user-1',
            pendingRunAsRequestedAt: expect.any(Date),
            pendingRunAsConfigurationHash: expect.any(String)
        })
        expect(jest.mocked(repository.update).mock.calls[0][1]).not.toHaveProperty('runAsUserId')
        expect(result).toMatchObject({
            runAsUserId: 'user-1',
            pendingRunAsUserId: 'user-2',
            pendingRunAsRequestedById: 'user-1'
        })
    })

    it('lets a Project manager propose a run-as transfer', async () => {
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('manager-1')
        const userRepository = createRepositoryMock<User>()
        jest.mocked(userRepository.findOne).mockResolvedValue({ id: 'user-2', tenantId: 'tenant-1' } as User)
        const projectAccess = {
            assertCanUse: jest.fn(),
            assertCanManage: jest.fn().mockResolvedValue({ project: { id: 'project-1' }, role: 'manager' }),
            assertCanUseXpert: jest.fn().mockResolvedValue({ project: { id: 'project-1' }, role: 'member' })
        }
        const service = createService(createCommandBusMock(), undefined, undefined, undefined, undefined, {
            projectAccess,
            publishedXpertAccess: {
                getAccessiblePublishedXpert: jest.fn().mockResolvedValue({ id: 'xpert-1' })
            },
            userRepository
        })
        jest.spyOn(service, 'findOne').mockResolvedValue(
            createTaskFixture({ projectId: 'project-1', organizationId: 'org-1', runAsUserId: 'user-1' })
        )

        await service.proposeProjectTaskRunAs('task-1', 'user-2')

        expect(projectAccess.assertCanManage).toHaveBeenCalledWith('project-1')
        expect(projectAccess.assertCanUse).not.toHaveBeenCalled()
    })

    it('rejects a run-as proposal when the target is outside the task tenant', async () => {
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-1')
        const repository = createRepositoryMock<XpertTask>()
        const userRepository = createRepositoryMock<User>()
        jest.mocked(userRepository.findOne).mockResolvedValue(null)
        const projectAccess = {
            assertCanUse: jest.fn().mockResolvedValue({ project: { id: 'project-1' }, role: 'member' }),
            assertCanManage: jest.fn(),
            assertCanUseXpert: jest.fn()
        }
        const service = createService(createCommandBusMock(), undefined, undefined, repository, undefined, {
            projectAccess,
            publishedXpertAccess: { getAccessiblePublishedXpert: jest.fn() },
            userRepository
        })
        jest.spyOn(service, 'findOne').mockResolvedValue(
            createTaskFixture({ projectId: 'project-1', organizationId: 'org-1', runAsUserId: 'user-1' })
        )

        await expect(service.proposeProjectTaskRunAs('task-1', 'other-tenant-user')).rejects.toThrow(
            'The proposed run-as user was not found in this tenant'
        )

        expect(userRepository.findOne).toHaveBeenCalledWith({
            where: { id: 'other-tenant-user', tenantId: 'tenant-1', type: UserType.USER },
            relations: ['role']
        })
        expect(projectAccess.assertCanUseXpert).not.toHaveBeenCalled()
        expect(repository.update).not.toHaveBeenCalled()
    })

    it('rejects a run-as proposal when the target is not a Project member', async () => {
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-1')
        const repository = createRepositoryMock<XpertTask>()
        const userRepository = createRepositoryMock<User>()
        jest.mocked(userRepository.findOne).mockResolvedValue({ id: 'user-2', tenantId: 'tenant-1' } as User)
        const projectAccess = {
            assertCanUse: jest.fn().mockResolvedValue({ project: { id: 'project-1' }, role: 'member' }),
            assertCanManage: jest.fn(),
            assertCanUseXpert: jest.fn().mockRejectedValue(new Error('Project membership is required'))
        }
        const service = createService(createCommandBusMock(), undefined, undefined, repository, undefined, {
            projectAccess,
            publishedXpertAccess: { getAccessiblePublishedXpert: jest.fn() },
            userRepository
        })
        jest.spyOn(service, 'findOne').mockResolvedValue(
            createTaskFixture({ projectId: 'project-1', organizationId: 'org-1', runAsUserId: 'user-1' })
        )

        await expect(service.proposeProjectTaskRunAs('task-1', 'user-2')).rejects.toThrow(
            'Project membership is required'
        )

        expect(repository.update).not.toHaveBeenCalled()
    })

    it('rejects a run-as proposal when the target cannot run the Project Xpert', async () => {
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-1')
        const repository = createRepositoryMock<XpertTask>()
        const userRepository = createRepositoryMock<User>()
        jest.mocked(userRepository.findOne).mockResolvedValue({ id: 'user-2', tenantId: 'tenant-1' } as User)
        const projectAccess = {
            assertCanUse: jest.fn().mockResolvedValue({ project: { id: 'project-1' }, role: 'member' }),
            assertCanManage: jest.fn(),
            assertCanUseXpert: jest.fn().mockResolvedValue({ project: { id: 'project-1' }, role: 'member' })
        }
        const service = createService(createCommandBusMock(), undefined, undefined, repository, undefined, {
            projectAccess,
            publishedXpertAccess: {
                getAccessiblePublishedXpert: jest.fn().mockRejectedValue(new Error('Xpert run access is required'))
            },
            userRepository
        })
        jest.spyOn(service, 'findOne').mockResolvedValue(
            createTaskFixture({ projectId: 'project-1', organizationId: 'org-1', runAsUserId: 'user-1' })
        )

        await expect(service.proposeProjectTaskRunAs('task-1', 'user-2')).rejects.toThrow(
            'Xpert run access is required'
        )

        expect(repository.update).not.toHaveBeenCalled()
    })

    it('changes run-as only after the proposed user accepts and revalidates access', async () => {
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-2')
        const repository = createRepositoryMock<XpertTask>()
        jest.mocked(repository.update).mockResolvedValue(Object.assign(new UpdateResult(), { affected: 1 }))
        const userRepository = createRepositoryMock<User>()
        const nextUser = { id: 'user-2', tenantId: 'tenant-1' } as User
        jest.mocked(userRepository.findOne).mockResolvedValue(nextUser)
        const projectAccess = {
            assertCanUse: jest.fn(),
            assertCanManage: jest.fn(),
            assertCanUseXpert: jest.fn().mockResolvedValue({ project: { id: 'project-1' }, role: 'member' })
        }
        const service = createService(createCommandBusMock(), undefined, undefined, repository, undefined, {
            projectAccess,
            publishedXpertAccess: {
                getAccessiblePublishedXpert: jest.fn().mockResolvedValue({ id: 'xpert-1' })
            },
            userRepository
        })
        const task = createTaskFixture({
            projectId: 'project-1',
            organizationId: 'org-1',
            runAsUserId: 'user-1',
            pendingRunAsUserId: 'user-2',
            pendingRunAsRequestedById: 'manager-1',
            pendingRunAsRequestedAt: new Date('2026-08-27T00:00:00.000Z')
        })
        const proposalConfigurationHash = task.pendingRunAsConfigurationHash
        jest.spyOn(service, 'findOne').mockResolvedValue(task)
        const rescheduleTask = jest.spyOn(service, 'rescheduleTask').mockImplementation()

        const result = await service.acceptProjectTaskRunAs('task-1')

        expect(repository.update).toHaveBeenCalledWith(
            {
                id: 'task-1',
                pendingRunAsUserId: 'user-2',
                pendingRunAsConfigurationHash: proposalConfigurationHash
            },
            {
                runAsUserId: 'user-2',
                pendingRunAsUserId: null,
                pendingRunAsRequestedById: null,
                pendingRunAsRequestedAt: null,
                pendingRunAsConfigurationHash: null
            }
        )
        expect(result).toMatchObject({
            runAsUserId: 'user-2',
            runAsUser: nextUser,
            pendingRunAsUserId: null,
            pendingRunAsRequestedById: null,
            pendingRunAsRequestedAt: null
        })
        expect(rescheduleTask).toHaveBeenCalledWith(expect.objectContaining({ runAsUserId: 'user-2' }), nextUser)
    })

    it('does not accept a run-as proposal for a different user', async () => {
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-3')
        const repository = createRepositoryMock<XpertTask>()
        const service = createService(createCommandBusMock(), undefined, undefined, repository)
        jest.spyOn(service, 'findOne').mockResolvedValue(
            createTaskFixture({
                projectId: 'project-1',
                organizationId: 'org-1',
                runAsUserId: 'user-1',
                pendingRunAsUserId: 'user-2'
            })
        )

        await expect(service.acceptProjectTaskRunAs('task-1')).rejects.toThrow(
            'Only the proposed run-as user can accept this transfer'
        )

        expect(repository.update).not.toHaveBeenCalled()
    })

    it('does not accept a run-as proposal after its Xpert or Connector snapshot changes', async () => {
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-2')
        const repository = createRepositoryMock<XpertTask>()
        const task = createTaskFixture({
            projectId: 'project-1',
            organizationId: 'org-1',
            runAsUserId: 'user-1',
            pendingRunAsUserId: 'user-2',
            runtimeState: createConnectorRuntimeState(['binding-1'])
        })
        task.runtimeState = createConnectorRuntimeState(['binding-2'])
        const service = createService(createCommandBusMock(), undefined, undefined, repository)
        jest.spyOn(service, 'findOne').mockResolvedValue(task)

        await expect(service.acceptProjectTaskRunAs('task-1')).rejects.toThrow(
            'The run-as transfer changed before it could be accepted'
        )

        expect(repository.update).not.toHaveBeenCalled()
    })

    it('does not accept a run-as proposal after the target loses Xpert run access', async () => {
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-2')
        const repository = createRepositoryMock<XpertTask>()
        const userRepository = createRepositoryMock<User>()
        jest.mocked(userRepository.findOne).mockResolvedValue({ id: 'user-2', tenantId: 'tenant-1' } as User)
        const service = createService(createCommandBusMock(), undefined, undefined, repository, undefined, {
            projectAccess: {
                assertCanUseXpert: jest.fn().mockResolvedValue({ project: { id: 'project-1' }, role: 'member' })
            },
            publishedXpertAccess: {
                getAccessiblePublishedXpert: jest.fn().mockRejectedValue(new Error('Xpert run access was revoked'))
            },
            userRepository
        })
        jest.spyOn(service, 'findOne').mockResolvedValue(
            createTaskFixture({
                projectId: 'project-1',
                organizationId: 'org-1',
                runAsUserId: 'user-1',
                pendingRunAsUserId: 'user-2'
            })
        )

        await expect(service.acceptProjectTaskRunAs('task-1')).rejects.toThrow('Xpert run access was revoked')

        expect(repository.update).not.toHaveBeenCalled()
    })

    it('does not accept a run-as proposal while selected personal Connectors are unavailable to the target', async () => {
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-2')
        const repository = createRepositoryMock<XpertTask>()
        const userRepository = createRepositoryMock<User>()
        jest.mocked(userRepository.findOne).mockResolvedValue({ id: 'user-2', tenantId: 'tenant-1' } as User)
        const connectorService = {
            resolveSelectedRuntimeBindings: jest.fn().mockRejectedValue(new Error('Personal grant is missing'))
        }
        const service = createService(createCommandBusMock(), undefined, undefined, repository, undefined, {
            projectAccess: {
                assertCanUseXpert: jest.fn().mockResolvedValue({ project: { id: 'project-1' }, role: 'member' })
            },
            publishedXpertAccess: {
                getAccessiblePublishedXpert: jest.fn().mockResolvedValue({ id: 'xpert-1' })
            },
            connectorService,
            userRepository
        })
        jest.spyOn(service, 'findOne').mockResolvedValue(
            createTaskFixture({
                projectId: 'project-1',
                organizationId: 'org-1',
                runAsUserId: 'user-1',
                pendingRunAsUserId: 'user-2',
                runtimeState: createConnectorRuntimeState(['binding-1'])
            })
        )

        await expect(service.acceptProjectTaskRunAs('task-1')).rejects.toThrow(
            'A selected Connector is not available to the run-as user'
        )

        expect(repository.update).not.toHaveBeenCalled()
    })

    it('limits HTTP task reads to active Project members without changing scheduler queries', async () => {
        jest.spyOn(RequestContext, 'currentUser').mockReturnValue({ id: 'user-1', tenantId: 'tenant-1' } as never)
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
        const repository = createRepositoryMock<XpertTask>()
        const ownerProjectSubquery = {
            select: jest.fn().mockReturnThis(),
            from: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            andWhere: jest.fn().mockReturnThis(),
            getQuery: jest.fn().mockReturnValue('(SELECT 1 FROM owner_project)')
        }
        const membershipSubquery = {
            select: jest.fn().mockReturnThis(),
            from: jest.fn().mockReturnThis(),
            innerJoin: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            getQuery: jest.fn().mockReturnValue('(SELECT 1 FROM active_membership)')
        }
        const query = {
            setFindOptions: jest.fn().mockReturnThis(),
            subQuery: jest.fn().mockReturnValueOnce(ownerProjectSubquery).mockReturnValueOnce(membershipSubquery),
            andWhere: jest.fn().mockReturnThis(),
            getManyAndCount: jest.fn().mockResolvedValue([[createTaskFixture({ projectId: 'project-1' })], 1])
        }
        jest.mocked(repository.createQueryBuilder).mockReturnValue(query as never)
        const service = createService(createCommandBusMock(), undefined, undefined, repository)

        await expect(
            service.findHttpAccessible({ where: { projectId: 'project-1' } }, { createdById: 'user-1' })
        ).resolves.toMatchObject({ total: 1 })

        expect(query.setFindOptions).toHaveBeenCalledWith({
            where: { projectId: 'project-1', createdById: 'user-1' }
        })
        expect(query).not.toHaveProperty('distinct')
        expect(ownerProjectSubquery.from).toHaveBeenCalledWith(XpertProject, 'httpOwnedProject')
        expect(membershipSubquery.from).toHaveBeenCalledWith(XpertProject, 'httpMemberProject')
        expect(membershipSubquery.innerJoin).toHaveBeenCalledWith(
            'httpMemberProject.memberships',
            'httpProjectMembership',
            'httpProjectMembership.userId = :httpUserId AND httpProjectMembership.deletedAt IS NULL',
            { httpUserId: 'user-1' }
        )
        expect(query.andWhere).toHaveBeenCalledWith('httpTask.tenantId = :httpTenantId', {
            httpTenantId: 'tenant-1'
        })
        expect(query.andWhere).toHaveBeenCalledWith('httpTask.organizationId = :httpOrganizationId', {
            httpOrganizationId: 'org-1'
        })
        const membershipScope = query.andWhere.mock.calls[1][0] as Brackets
        const predicate = {
            where: jest.fn().mockReturnThis(),
            orWhere: jest.fn().mockReturnThis()
        }
        membershipScope.whereFactory(predicate as never)
        expect(predicate.where).toHaveBeenCalledWith(
            'httpTask.projectId IS NULL AND httpTask.createdById = :httpUserId'
        )
        expect(predicate.orWhere).toHaveBeenNthCalledWith(1, 'EXISTS (SELECT 1 FROM owner_project)')
        expect(predicate.orWhere).toHaveBeenNthCalledWith(2, 'EXISTS (SELECT 1 FROM active_membership)')

        const rawFindAll = jest.spyOn(service, 'findAll').mockResolvedValue({ items: [], total: 0 })
        const httpFindAll = jest.spyOn(service, 'findHttpAccessible')
        await service.getActiveJobs()

        expect(rawFindAll).toHaveBeenCalledWith({
            where: { status: ScheduleTaskStatus.SCHEDULED },
            relations: ['createdBy', 'createdBy.role', 'runAsUser', 'runAsUser.role']
        })
        expect(httpFindAll).toHaveBeenCalledTimes(0)
    })

    it('requires Project manager access for Project tasks and ownership for personal tasks', async () => {
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-1')
        const projectAccess = {
            assertCanManage: jest.fn().mockResolvedValue({ project: { id: 'project-1' }, role: 'manager' }),
            assertCanUseXpert: jest.fn()
        }
        const service = createService(createCommandBusMock(), undefined, undefined, undefined, undefined, {
            projectAccess
        })
        const findOne = jest
            .spyOn(service, 'findOne')
            .mockResolvedValueOnce(createTaskFixture({ projectId: 'project-1' }))
            .mockResolvedValueOnce(createTaskFixture({ projectId: null }))
        const deleteJob = jest.spyOn(service, 'deleteJob').mockImplementation()
        const deleteTask = jest.spyOn(service, 'delete').mockResolvedValue(undefined)

        await service.deleteHttpTask('project-task')

        expect(projectAccess.assertCanManage).toHaveBeenCalledWith('project-1')
        expect(deleteJob).toHaveBeenCalledWith('project-task')
        expect(deleteTask).toHaveBeenCalledWith('project-task')

        projectAccess.assertCanManage.mockClear()
        await service.deleteHttpTask('personal-task')

        expect(findOne).toHaveBeenLastCalledWith('personal-task', { withDeleted: false })
        expect(projectAccess.assertCanManage).not.toHaveBeenCalled()
        expect(deleteTask).toHaveBeenCalledWith('personal-task')

        findOne.mockResolvedValueOnce(createTaskFixture({ projectId: null, createdById: 'user-2' }))
        await expect(service.deleteHttpTask('other-personal-task')).rejects.toBeInstanceOf(ForbiddenException)
        expect(deleteTask).not.toHaveBeenCalledWith('other-personal-task')
    })

    it('requires Project manager access before recovering a soft-deleted Project task', async () => {
        const projectAccess = {
            assertCanManage: jest.fn().mockResolvedValue({ project: { id: 'project-1' }, role: 'manager' }),
            assertCanUseXpert: jest.fn()
        }
        const service = createService(createCommandBusMock(), undefined, undefined, undefined, undefined, {
            projectAccess
        })
        const findOne = jest.spyOn(service, 'findOne').mockResolvedValue(createTaskFixture({ projectId: 'project-1' }))
        const recover = jest.spyOn(service, 'softRecover').mockResolvedValue(createTaskFixture())

        await service.recoverHttpTask('project-task')

        expect(findOne).toHaveBeenCalledWith('project-task', { withDeleted: true })
        expect(projectAccess.assertCanManage).toHaveBeenCalledWith('project-1')
        expect(recover).toHaveBeenCalledWith('project-task', { withDeleted: true })
    })

    it('requires Project manager access before pausing and soft-removing a Project task', async () => {
        const projectAccess = {
            assertCanManage: jest.fn().mockResolvedValue({ project: { id: 'project-1' }, role: 'manager' }),
            assertCanUseXpert: jest.fn()
        }
        const service = createService(createCommandBusMock(), undefined, undefined, undefined, undefined, {
            projectAccess
        })
        jest.spyOn(service, 'findOne').mockResolvedValue(createTaskFixture({ projectId: 'project-1' }))
        const pause = jest.spyOn(service, 'pause').mockResolvedValue(createTaskFixture())
        const softRemove = jest.spyOn(service, 'softRemove').mockResolvedValue(createTaskFixture())

        await service.softDeleteHttpTask('project-task')

        expect(projectAccess.assertCanManage).toHaveBeenCalledWith('project-1')
        expect(pause).toHaveBeenCalledWith('project-task')
        expect(softRemove).toHaveBeenCalledWith('project-task')
    })
})

function createService(
    commandBus: CommandBusMock,
    xpertService = createXpertServiceMock(),
    agentMiddlewareRegistry = createAgentMiddlewareRegistryMock(),
    repository = createRepositoryMock<XpertTask>(),
    conversationRepository = createRepositoryMock<ChatConversation>(),
    options: {
        autoTaskRepository?: Repository<AutoTask>
        redisLockService?: ReturnType<typeof createRedisLockServiceMock>
        projectAccess?: Partial<
            Pick<XpertProjectAccessService, 'assertCanUse' | 'assertCanManage' | 'assertCanUseXpert'>
        >
        publishedXpertAccess?: Pick<PublishedXpertAccessService, 'getAccessiblePublishedXpert'>
        projectXpertBinding?: Pick<XpertProjectXpertBindingService, 'resolveCurrentById'>
        connectorService?: Pick<ConnectorService, 'resolveSelectedRuntimeBindings'> &
            Partial<Pick<ConnectorService, 'listBindings'>>
        userRepository?: Repository<User>
        outboundActorTokenProvider?: { mint: jest.Mock }
    } = {}
) {
    const autoTaskRepository = options.autoTaskRepository ?? createRepositoryMock<AutoTask>()
    const redisLockService = options.redisLockService ?? createRedisLockServiceMock()
    return new XpertTaskService(
        repository,
        createRepositoryMock<ScheduleNote>(),
        conversationRepository,
        autoTaskRepository,
        createRepositoryMock<AutoTaskTemplate>(),
        createRepositoryMock<XpertTaskTemplate>(),
        createSchedulerRegistryMock(),
        xpertService as unknown as XpertService,
        agentMiddlewareRegistry as unknown as AgentMiddlewareRegistry,
        commandBus as unknown as CommandBus,
        createQueryBusMock(),
        redisLockService as unknown as RedisLockService,
        {
            listBindings: jest.fn().mockResolvedValue([]),
            resolveSelectedRuntimeBindings: jest.fn().mockResolvedValue([]),
            ...(options.connectorService ?? {})
        } as ConnectorService,
        options.userRepository ?? createRepositoryMock<User>(),
        (options.projectXpertBinding ?? {
            resolveCurrentById: jest.fn(async (id: string) => ({ id }))
        }) as XpertProjectXpertBindingService,
        options.outboundActorTokenProvider as OutboundActorTokenProvider | undefined,
        undefined,
        options.projectAccess as XpertProjectAccessService | undefined,
        options.publishedXpertAccess as PublishedXpertAccessService | undefined
    )
}

function createRedisLockServiceMock() {
    const runWithLock = jest.fn<Promise<RedisLockRunResult<unknown>>, [string, number, () => Promise<unknown>]>(
        async (_key, _ttl, operation) => ({
            acquired: true,
            value: await operation()
        })
    )
    return {
        runWithLock
    }
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
            stateSchema: z.object({
                xpert_task_uuid: z.string().describe('wx2.0 Account UUID'),
                xpert_task_chat_type: z.enum(['private', 'group']).optional().describe('Chat Type'),
                contact_id: z.string().describe('Regular runtime state, not schedule task configurable')
            }),
            stateFormSchema: {
                type: 'object',
                required: ['xpert_task_uuid'],
                properties: {
                    xpert_task_uuid: {
                        type: 'string',
                        title: {
                            en_US: 'wx2.0 Account UUID',
                            zh_Hans: 'wx2.0 账号 UUID'
                        },
                        'x-ui': {
                            component: 'remoteSelect'
                        }
                    },
                    xpert_task_chat_type: {
                        type: 'string',
                        enum: ['private', 'group'],
                        title: {
                            en_US: 'Chat Type',
                            zh_Hans: '会话类型'
                        },
                        'x-ui': {
                            enumLabels: {
                                group: {
                                    zh_Hans: '群聊'
                                }
                            }
                        }
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

    if (task.pendingRunAsUserId && task.pendingRunAsConfigurationHash === undefined) {
        task.pendingRunAsConfigurationHash = buildProjectTaskRunAsConfigurationHash(task)
    }

    return task as unknown as XpertTask
}

function createConnectorRuntimeState(bindingIds: string[]): TXpertChatState {
    const runtimeCapabilities: RuntimeCapabilitiesSelection & {
        connectors: { bindingIds: string[] }
    } = {
        mode: 'allowlist',
        skills: { ids: [] },
        plugins: { nodeKeys: [] },
        connectors: { bindingIds }
    }
    return {
        [STATE_VARIABLE_HUMAN]: {
            runtimeCapabilities
        }
    }
}

function createInheritedConnectorRuntimeState(
    bindingIds: string[],
    overrides: Partial<RuntimeCapabilitiesSelection> = {}
): TXpertChatState {
    const runtimeCapabilities: RuntimeCapabilitiesSelection & {
        inheritUnselected: true
        connectors: { bindingIds: string[] }
    } = {
        ...overrides,
        mode: 'allowlist',
        skills: { ids: [] },
        plugins: { nodeKeys: [] },
        inheritUnselected: true,
        connectors: { bindingIds }
    }
    return {
        [STATE_VARIABLE_HUMAN]: {
            runtimeCapabilities
        }
    }
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
