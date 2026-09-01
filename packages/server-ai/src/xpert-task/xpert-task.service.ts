import {
    generateCronExpression,
    getAgentMiddlewareNodes,
    IWFNMiddleware,
    I18nObject,
    IUser,
    IXpertTask,
    JsonSchemaObjectType,
    RolesEnum,
    TChatOptions,
    TXpertChatState,
    TXpertGraph,
    TXpertTaskScheduleCapabilities,
    TScheduleOptions,
    ScheduleTaskStatus,
    STATE_VARIABLE_HUMAN,
    TaskFrequency,
    UserType,
    WorkflowNodeTypeEnum,
    XPERT_TASK_SCHEDULE_IDEMPOTENCY_KEY,
    XPERT_TASK_SCHEDULE_PROPERTY_PREFIX,
    XpertAgentExecutionStatusEnum
} from '@xpert-ai/contracts'
import { AgentMiddlewareRegistry } from '@xpert-ai/plugin-sdk'
import { getErrorMessage } from '@xpert-ai/server-common'
import { ConfigService } from '@xpert-ai/server-config'
import {
    OutboundActorTokenProvider,
    RedisLockService,
    RequestContext,
    TenantOrganizationAwareCrudService,
    User
} from '@xpert-ai/server-core'
import {
    BadRequestException,
    ForbiddenException,
    Inject,
    Injectable,
    Logger,
    NotFoundException,
    OnModuleInit,
    Optional
} from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { OnEvent } from '@nestjs/event-emitter'
import { Cron, SchedulerRegistry } from '@nestjs/schedule'
import { InjectRepository } from '@nestjs/typeorm'
import chalk from 'chalk'
import { CronJob, CronTime } from 'cron'
import { isEqual } from 'lodash'
import { lastValueFrom, toArray } from 'rxjs'
import {
    Brackets,
    Between,
    FindManyOptions,
    FindOptionsWhere,
    In,
    IsNull,
    Repository,
    SelectQueryBuilder
} from 'typeorm'
import { t } from 'i18next'
import { createHash, randomUUID } from 'node:crypto'
import { XpertChatCommand } from '../xpert/commands'
import { XpertService } from '../xpert/xpert.service'
import { PublishedXpertAccessService } from '../xpert/published-xpert-access.service'
import { ChatConversation } from '../chat-conversation/conversation.entity'
import { ChatConversationUpsertCommand } from '../chat-conversation'
import { XpertAgentExecutionUpsertCommand } from '../xpert-agent-execution'
import { ToolSchemaParser } from '../shared/tools/utils'
import { AutoTask } from './auto-task.entity'
import { AutoTaskTemplate } from './auto-task-template.entity'
import { applyScheduledTaskOidcContext } from './scheduled-task-oidc-token'
import { ScheduleNote, ScheduleNoteStatus, ScheduleNoteType } from './schedule-note.entity'
import { XpertTask } from './xpert-task.entity'
import { XpertTaskTemplate } from './xpert-task-template.entity'
import { ScheduledTaskExecution, ScheduledTaskExecutionStatus } from './scheduled-task-execution.entity'
import {
    ScheduledTaskExecutionCoordinator,
    TypeOrmScheduledTaskExecutionStore
} from './scheduled-task-execution.coordinator'
import { captureRequestContext, runWithCapturedRequestContext } from '../shared/request-context'
import { XpertProjectAccessService } from '../xpert-project/services/project-access.service'
import { XpertProjectXpertBindingService } from '../xpert-project/services/project-xpert-binding.service'
import { XpertProject } from '../xpert-project/entities/project.entity'
import { ConnectorService } from '../connector/connector.service'
import { getRuntimeConnectorBindingIds } from '../shared/agent/runtime-capabilities'

export type ProjectMemberRemovedEvent = {
    tenantId: string
    organizationId?: string | null
    projectId: string
    userId: string
}

export type ProjectXpertRemovedEvent = {
    tenantId: string
    organizationId?: string | null
    projectId: string
    xpertIds: string[]
}

const SCHEDULED_TASK_HEARTBEAT_MS = 60 * 1000
const AUTO_TASK_CRON_LOCK_KEY = 'scheduler:xpert-auto-task'
const AUTO_TASK_CRON_LOCK_TTL = 5 * 60 * 1000
const PROJECT_TASK_RUN_AS_USER_MISSING = 'The scheduled task no longer has a valid run-as user'
const PROJECT_TASK_XPERT_REQUIRED = 'A Project automation must be bound to a Project Xpert'
const PROJECT_TASK_ACCESS_UNAVAILABLE = 'Project task access validation is not available'
const PROJECT_TASK_RUN_AS_PROJECT_REQUIRED = 'Run-as transfer is only available for Project automations'
const PROJECT_TASK_RUN_AS_TARGET_REQUIRED = 'Select a run-as user'
const PROJECT_TASK_RUN_AS_TARGET_NOT_FOUND = 'The proposed run-as user was not found in this tenant'
const PROJECT_TASK_RUN_AS_ALREADY_ASSIGNED = 'The selected user is already the run-as user'
const PROJECT_TASK_RUN_AS_PROPOSAL_MISSING = 'This automation has no pending run-as transfer'
const PROJECT_TASK_RUN_AS_PROPOSAL_TARGET_ONLY = 'Only the proposed run-as user can accept this transfer'
const PROJECT_TASK_RUN_AS_PROPOSAL_CHANGED = 'The run-as transfer changed before it could be accepted'
const PROJECT_TASK_PERSONAL_CONNECTOR_RUN_AS_ONLY =
    'Only the confirmed run-as user can change personal Connectors for this automation'

@Injectable()
export class XpertTaskService extends TenantOrganizationAwareCrudService<XpertTask> implements OnModuleInit {
    readonly #logger = new Logger(XpertTaskService.name)

    @Inject(ConfigService)
    protected readonly configService: ConfigService

    constructor(
        @InjectRepository(XpertTask)
        repository: Repository<XpertTask>,
        @InjectRepository(ScheduleNote)
        private readonly scheduleNoteRepository: Repository<ScheduleNote>,
        @InjectRepository(ChatConversation)
        private readonly chatConversationRepository: Repository<ChatConversation>,
        @InjectRepository(AutoTask)
        private readonly autoTaskRepository: Repository<AutoTask>,
        @InjectRepository(AutoTaskTemplate)
        private readonly autoTaskTemplateRepository: Repository<AutoTaskTemplate>,
        @InjectRepository(XpertTaskTemplate)
        private readonly xpertTaskTemplateRepository: Repository<XpertTaskTemplate>,
        private readonly schedulerRegistry: SchedulerRegistry,
        private readonly xpertService: XpertService,
        private readonly agentMiddlewareRegistry: AgentMiddlewareRegistry,
        private readonly commandBus: CommandBus,
        private readonly queryBus: QueryBus,
        private readonly redisLockService: RedisLockService,
        private readonly connectorService: ConnectorService,
        @InjectRepository(User)
        private readonly userRepository: Repository<User>,
        private readonly projectXpertBindingService: XpertProjectXpertBindingService,
        @Optional()
        private readonly outboundActorTokenProvider?: OutboundActorTokenProvider,
        @Optional()
        @InjectRepository(ScheduledTaskExecution)
        private readonly scheduledTaskExecutionRepository?: Repository<ScheduledTaskExecution>,
        @Optional()
        private readonly projectAccessService?: XpertProjectAccessService,
        @Optional()
        private readonly publishedXpertAccessService?: PublishedXpertAccessService
    ) {
        super(repository)
        if (scheduledTaskExecutionRepository) {
            this.scheduledTaskExecutionCoordinator = new ScheduledTaskExecutionCoordinator(
                new TypeOrmScheduledTaskExecutionStore(scheduledTaskExecutionRepository)
            )
        }
    }

    private readonly scheduledTaskExecutionCoordinator?: ScheduledTaskExecutionCoordinator

    /**
     * HTTP-only query boundary. Internal schedulers deliberately continue to use
     * findAll/findOne so background recovery is not evaluated as the HTTP actor.
     */
    async findHttpAccessible(filter: FindManyOptions<XpertTask> = {}, requiredWhere?: FindOptionsWhere<XpertTask>) {
        const user = RequestContext.currentUser()
        if (!user?.id || !user.tenantId) {
            throw new ForbiddenException(
                t('server-ai:Error.AuthenticatedUserRequired', { defaultValue: 'An authenticated user is required' })
            )
        }

        const query = this.repository.createQueryBuilder('httpTask')
        query.setFindOptions({
            ...filter,
            ...(requiredWhere ? { where: mergeRequiredTaskWhere(filter.where, requiredWhere) } : {})
        })
        const ownedProjectExists = query
            .subQuery()
            .select('1')
            .from(XpertProject, 'httpOwnedProject')
            .where('httpOwnedProject.id = httpTask.projectId')
            .andWhere('httpOwnedProject.ownerId = :httpUserId', { httpUserId: user.id })
            .getQuery()
        const activeMembershipExists = query
            .subQuery()
            .select('1')
            .from(XpertProject, 'httpMemberProject')
            .innerJoin(
                'httpMemberProject.memberships',
                'httpProjectMembership',
                'httpProjectMembership.userId = :httpUserId AND httpProjectMembership.deletedAt IS NULL',
                { httpUserId: user.id }
            )
            .where('httpMemberProject.id = httpTask.projectId')
            .getQuery()
        query.andWhere('httpTask.tenantId = :httpTenantId', { httpTenantId: user.tenantId }).andWhere(
            new Brackets((qb) => {
                qb.where('httpTask.projectId IS NULL AND httpTask.createdById = :httpUserId')
                    .orWhere(`EXISTS ${ownedProjectExists}`)
                    .orWhere(`EXISTS ${activeMembershipExists}`)
            })
        )

        const organizationId = RequestContext.getOrganizationId()
        if (organizationId)
            query.andWhere('httpTask.organizationId = :httpOrganizationId', { httpOrganizationId: organizationId })
        else query.andWhere('httpTask.organizationId IS NULL')

        const [items, total] = await query.getManyAndCount()
        return { items, total }
    }

    async findHttpAccessibleById(
        id: string,
        relations?: FindManyOptions<XpertTask>['relations'],
        select?: FindManyOptions<XpertTask>['select']
    ) {
        const { items } = await this.findHttpAccessible({ where: { id }, relations, select, take: 1 })
        const task = items[0]
        if (!task) {
            throw new NotFoundException(
                t('server-ai:Error.XpertTaskNotFound', { defaultValue: 'The requested Xpert task was not found' })
            )
        }
        return task
    }

    async updateHttpTask(id: string, entity: Partial<IXpertTask>) {
        const task = await this.findOne(id)
        if (!task.projectId) {
            await this.assertHttpMutationAccess(id)
        }
        return this.updateTask(id, entity)
    }

    async scheduleHttpTask(id: string, entity?: Partial<IXpertTask>) {
        await this.assertHttpMutationAccess(id)
        return entity ? this.updateTask(id, { ...entity, status: ScheduleTaskStatus.SCHEDULED }) : this.schedule(id)
    }

    async pauseHttpTask(id: string) {
        await this.assertHttpMutationAccess(id)
        return this.pause(id)
    }

    async archiveHttpTask(id: string) {
        await this.assertHttpMutationAccess(id)
        return this.archive(id)
    }

    async unarchiveHttpTask(id: string) {
        await this.assertHttpMutationAccess(id)
        return this.unarchive(id)
    }

    async testHttpTask(id: string, options: TChatOptions) {
        await this.assertHttpMutationAccess(id)
        return this.test(id, options)
    }

    async deleteHttpTask(id: string) {
        await this.assertHttpMutationAccess(id)
        this.deleteJob(id)
        return this.delete(id)
    }

    async softDeleteHttpTask(id: string) {
        await this.assertHttpMutationAccess(id)
        await this.pause(id)
        return this.softRemove(id)
    }

    async recoverHttpTask(id: string) {
        await this.assertHttpMutationAccess(id, true)
        return this.softRecover(id, { withDeleted: true })
    }

    async proposeProjectTaskRunAs(id: string, nextRunAsUserId: string) {
        const task = await this.findOne(id)
        const { projectId, xpertId } = this.requireProjectTaskRunAsScope(task)
        const actorId = this.requireCurrentUserId()
        const currentRunAsUserId = task.runAsUserId ?? task.createdById
        const { projectAccessService } = this.getProjectAccessServices()
        if (actorId === currentRunAsUserId) {
            await projectAccessService.assertCanUse(projectId)
        } else {
            await projectAccessService.assertCanManage(projectId)
        }

        const targetUserId = nextRunAsUserId?.trim()
        if (!targetUserId) {
            throw new BadRequestException(
                t('server-ai:Error.ProjectTaskRunAsTargetRequired', {
                    defaultValue: PROJECT_TASK_RUN_AS_TARGET_REQUIRED
                }) || PROJECT_TASK_RUN_AS_TARGET_REQUIRED
            )
        }
        if (targetUserId === currentRunAsUserId) {
            throw new BadRequestException(
                t('server-ai:Error.ProjectTaskRunAsAlreadyAssigned', {
                    defaultValue: PROJECT_TASK_RUN_AS_ALREADY_ASSIGNED
                }) || PROJECT_TASK_RUN_AS_ALREADY_ASSIGNED
            )
        }

        const { xpertId: currentXpertId } = await this.assertProjectTaskRunAsTarget(
            task,
            projectId,
            xpertId,
            targetUserId
        )
        const xpertIdChanged = currentXpertId !== task.xpertId
        task.xpertId = currentXpertId
        const proposal = {
            ...(xpertIdChanged ? { xpertId: currentXpertId } : {}),
            pendingRunAsUserId: targetUserId,
            pendingRunAsRequestedById: actorId,
            pendingRunAsRequestedAt: new Date(),
            pendingRunAsConfigurationHash: buildProjectTaskRunAsConfigurationHash(task)
        }
        await this.repository.update(task.id, proposal)
        Object.assign(task, proposal)
        return task
    }

    async acceptProjectTaskRunAs(id: string) {
        const task = await this.findOne(id)
        const { projectId, xpertId } = this.requireProjectTaskRunAsScope(task)
        const actorId = this.requireCurrentUserId()
        if (!task.pendingRunAsUserId) {
            throw new BadRequestException(
                t('server-ai:Error.ProjectTaskRunAsProposalMissing', {
                    defaultValue: PROJECT_TASK_RUN_AS_PROPOSAL_MISSING
                }) || PROJECT_TASK_RUN_AS_PROPOSAL_MISSING
            )
        }
        if (task.pendingRunAsUserId !== actorId) {
            throw new ForbiddenException(
                t('server-ai:Error.ProjectTaskRunAsProposalTargetOnly', {
                    defaultValue: PROJECT_TASK_RUN_AS_PROPOSAL_TARGET_ONLY
                }) || PROJECT_TASK_RUN_AS_PROPOSAL_TARGET_ONLY
            )
        }

        const configurationHash = buildProjectTaskRunAsConfigurationHash(task)
        if (!task.pendingRunAsConfigurationHash || task.pendingRunAsConfigurationHash !== configurationHash) {
            throw new BadRequestException(
                t('server-ai:Error.ProjectTaskRunAsProposalChanged', {
                    defaultValue: PROJECT_TASK_RUN_AS_PROPOSAL_CHANGED
                }) || PROJECT_TASK_RUN_AS_PROPOSAL_CHANGED
            )
        }

        const { user: nextRunAsUser, xpertId: currentXpertId } = await this.assertProjectTaskRunAsTarget(
            task,
            projectId,
            xpertId,
            actorId
        )
        await this.assertProjectTaskConnectorSelection({ ...task, xpertId: currentXpertId }, nextRunAsUser)
        const update = {
            ...(currentXpertId !== task.xpertId ? { xpertId: currentXpertId } : {}),
            runAsUserId: actorId,
            pendingRunAsUserId: null,
            pendingRunAsRequestedById: null,
            pendingRunAsRequestedAt: null,
            pendingRunAsConfigurationHash: null
        }
        const result = await this.repository.update(
            {
                id: task.id,
                pendingRunAsUserId: actorId,
                pendingRunAsConfigurationHash: configurationHash
            },
            update
        )
        if (result.affected !== 1) {
            throw new BadRequestException(
                t('server-ai:Error.ProjectTaskRunAsProposalChanged', {
                    defaultValue: PROJECT_TASK_RUN_AS_PROPOSAL_CHANGED
                }) || PROJECT_TASK_RUN_AS_PROPOSAL_CHANGED
            )
        }

        Object.assign(task, update, { runAsUser: nextRunAsUser })
        if (task.status === ScheduleTaskStatus.SCHEDULED) {
            this.rescheduleTask(task, nextRunAsUser)
        }
        return task
    }

    async assertHttpMutationAccess(id: string, withDeleted = false) {
        const task = await this.findOne(id, { withDeleted })
        if (task.projectId) {
            if (!this.projectAccessService) {
                throw new Error(
                    t('server-ai:Error.ProjectTaskAccessUnavailable', {
                        defaultValue: PROJECT_TASK_ACCESS_UNAVAILABLE
                    }) || PROJECT_TASK_ACCESS_UNAVAILABLE
                )
            }
            await this.projectAccessService.assertCanManage(task.projectId)
        } else if (task.createdById !== RequestContext.currentUserId()) {
            throw new ForbiddenException(
                t('server-ai:Error.XpertTaskAccessDenied', {
                    defaultValue: 'You cannot access this Xpert task.'
                })
            )
        }
        return task
    }

    async onModuleInit() {
        const { items: jobs, total } = await this.getActiveJobs()
        jobs.filter((job) => job.options).forEach((job) => {
            try {
                this.scheduleCronJob(job, job.runAsUser ?? job.createdBy)
            } catch (err) {
                console.error(chalk.red('Schedule "' + job.name + '" error:' + getErrorMessage(err)))
            }
        })
        console.log(chalk.magenta(`Scheduled ${total} tasks for xpert`))
    }

    async executeTask(
        id: string,
        options: TChatOptions,
        scheduledAt?: Date,
        scheduledExecution?: ScheduledTaskExecution
    ) {
        try {
            const task = await this.findOne(id, {
                relations: ['xpert', 'createdBy', 'createdBy.role', 'runAsUser', 'runAsUser.role']
            })
            const actor = task.runAsUser ?? task.createdBy
            if (!actor) {
                const reason =
                    t('server-ai:Error.ProjectTaskRunAsUserMissing', {
                        defaultValue: PROJECT_TASK_RUN_AS_USER_MISSING
                    }) || PROJECT_TASK_RUN_AS_USER_MISSING
                await this.pauseInvalidProjectTask(task, reason)
                throw new BadRequestException(reason)
            }
            return await this.runWithTaskRequestContext(task, actor, () =>
                this.executeLoadedTask(task, actor, options, scheduledAt, scheduledExecution)
            )
        } catch (error) {
            if (scheduledExecution) {
                await this.requireScheduledTaskExecutionCoordinator().finish(
                    scheduledExecution,
                    ScheduledTaskExecutionStatus.FAILED,
                    error
                )
            }
            throw error
        }
    }

    private async executeLoadedTask(
        task: XpertTask,
        actor: IUser,
        options: TChatOptions,
        scheduledAt?: Date,
        scheduledExecution?: ScheduledTaskExecution
    ) {
        await this.assertProjectTaskCanRun(task).catch(async (error) => {
            await this.pauseInvalidProjectTask(task, getErrorMessage(error))
            throw error
        })
        const chatOptions = applyScheduledTaskOidcContext(task, actor, options, this.outboundActorTokenProvider)
        if (scheduledExecution) {
            await this.requireScheduledTaskExecutionCoordinator().markRunning(scheduledExecution)
        }
        const runtimeState = await this.resolveTaskRuntimeState(task, scheduledAt)
        const conversationId = scheduledExecution?.conversationId ?? randomUUID()
        const executionId = scheduledExecution?.executionId ?? randomUUID()
        await this.assertProjectTaskConnectorsCanRun(task, actor, runtimeState, conversationId, executionId).catch(
            async (error) => {
                const detail = getErrorMessage(error)
                const reason =
                    t('server-ai:Error.ProjectTaskConnectorUnavailable', {
                        reason: detail,
                        defaultValue: `Project automation was paused because a selected Connector is unavailable: ${detail}`
                    }) || `Project automation was paused because a selected Connector is unavailable: ${detail}`
                await this.pauseInvalidProjectTask(task, reason)
                throw new BadRequestException(reason)
            }
        )
        const { observable, conversation, execution } = await this.createPersistedTaskChatRun({
            prompt: task.prompt,
            xpertId: task.xpertId,
            projectId: task.projectId,
            taskId: task.id,
            conversationTaskId: task.id,
            conversationId,
            executionId,
            timeZone: task.timeZone || options.timeZone,
            runtimeState,
            chatOptions
        })
        if (scheduledExecution) {
            await this.requireScheduledTaskExecutionCoordinator().bindRun(
                scheduledExecution,
                conversation.id,
                execution.id
            )
        }

        const heartbeat = scheduledExecution
            ? setInterval(() => {
                  void this.requireScheduledTaskExecutionCoordinator()
                      .refreshLease(scheduledExecution)
                      .catch((error) => {
                          this.#logger.warn(`Scheduled task lease refresh failed: ${getErrorMessage(error)}`)
                      })
              }, SCHEDULED_TASK_HEARTBEAT_MS)
            : undefined
        const finish = (status: ScheduledTaskExecutionStatus, error?: unknown) => {
            if (heartbeat) {
                clearInterval(heartbeat)
            }
            if (scheduledExecution) {
                void this.finishScheduledTaskExecution(task, scheduledExecution, status, error).catch((finishError) => {
                    this.#logger.error(`Scheduled task state update failed: ${getErrorMessage(finishError)}`)
                })
            }
        }

        observable.subscribe({
            next: () => undefined,
            error: (error) => {
                this.#logger.error('Scheduled task execution failed:', getErrorMessage(error))
                finish(ScheduledTaskExecutionStatus.FAILED, error)
            },
            complete: () => finish(ScheduledTaskExecutionStatus.SUCCEEDED)
        })

        return {
            conversationId: conversation.id,
            threadId: conversation.threadId,
            runId: execution.id
        }
    }

    private async createPersistedTaskChatRun(params: {
        prompt?: string | null
        xpertId?: string | null
        projectId?: string | null
        taskId?: string | null
        conversationTaskId?: string | null
        conversationId?: string | null
        executionId?: string | null
        timeZone?: string | null
        runtimeState?: TXpertChatState | null
        chatOptions?: TChatOptions
    }) {
        const conversation = await this.commandBus.execute<ChatConversationUpsertCommand, ChatConversation>(
            new ChatConversationUpsertCommand({
                id: params.conversationId ?? undefined,
                status: 'busy',
                taskId: params.conversationTaskId ?? undefined,
                xpertId: params.xpertId ?? undefined,
                projectId: params.projectId ?? undefined,
                options: {
                    parameters: {
                        input: params.prompt
                    }
                },
                from: 'job'
            })
        )
        const execution = await this.commandBus.execute(
            new XpertAgentExecutionUpsertCommand({
                id: params.executionId ?? undefined,
                xpertId: params.xpertId ?? undefined,
                status: XpertAgentExecutionStatusEnum.RUNNING,
                threadId: conversation.threadId
            })
        )
        const observable = await this.commandBus.execute(
            new XpertChatCommand(
                {
                    action: 'send',
                    conversationId: conversation.id,
                    message: {
                        input: {
                            input: params.prompt
                        }
                    },
                    ...(params.runtimeState ? { state: params.runtimeState } : {})
                },
                {
                    ...(params.chatOptions ?? {}),
                    xpertId: params.xpertId ?? undefined,
                    projectId: params.projectId ?? undefined,
                    timeZone: params.timeZone ?? params.chatOptions?.timeZone,
                    from: 'job',
                    taskId: params.taskId ?? undefined,
                    execution: { id: execution.id },
                    streamPersistence: {
                        transport: 'redis-stream',
                        threadId: conversation.threadId,
                        runId: execution.id
                    }
                }
            )
        )

        return {
            observable,
            conversation,
            execution
        }
    }

    scheduleCronJob(task: IXpertTask, user: IUser) {
        const MaximumRuns = 10
        let runs = 0

        const cronTime = generateCronExpression(task.options)
        const scheduleJob = () => {
            const job = CronJob.from({
                cronTime: cronTime,
                timeZone: task.timeZone || 'UTC',

                onTick: () => {
                    const scheduledAt = resolveScheduledOccurrence(task)
                    void this.runWithTaskRequestContext(task, user, () => {
                        if (!task.xpertId) {
                            return
                        }
                        if (RequestContext.hasRole(RolesEnum.TRIAL) && runs >= MaximumRuns) {
                            return this.pause(task.id).then(() => undefined)
                        }
                        return this.requireScheduledTaskExecutionCoordinator()
                            .claim(task, buildScheduleOccurrenceKey(task, scheduledAt), scheduledAt)
                            .then((scheduledExecution) => {
                                if (!scheduledExecution) {
                                    return
                                }
                                runs += 1
                                this.#logger.verbose(`Times (${runs}) for job ${task.name} to run!`)
                                void this.executeTask(
                                    task.id,
                                    { timeZone: task.timeZone },
                                    scheduledAt,
                                    scheduledExecution
                                ).catch((err) => {
                                    this.#logger.error(err)
                                })
                            })
                    }).catch((err) => {
                        this.#logger.error(err)
                    })
                }
            })
            if (task.options.frequency === TaskFrequency.Once) {
                job.runOnce = true
            }
            this.schedulerRegistry.addCronJob(task.id, job)
            job.start()
        }

        if (RequestContext.currentUser()) {
            scheduleJob()
        } else {
            void this.runWithTaskRequestContext(task, user, () => {
                try {
                    scheduleJob()
                } catch (err) {
                    console.error(chalk.red('Schedule "' + task.name + '" error: ' + getErrorMessage(err)))
                }
            }).catch((err) => {
                this.#logger.error(err)
            })
        }

        this.#logger.warn(`job ${task.name} added for '${cronTime}' and timezone '${task.timeZone}'!`)
    }

    @Cron('30 * * * * *')
    async recoverExpiredScheduledTaskExecutions() {
        if (!this.scheduledTaskExecutionCoordinator) {
            return
        }

        const expiredExecutions = await this.scheduledTaskExecutionCoordinator.findExpired()
        for (const expiredExecution of expiredExecutions) {
            const task = await this.repository
                .createQueryBuilder('task')
                .leftJoinAndSelect('task.createdBy', 'createdBy')
                .leftJoinAndSelect('createdBy.role', 'createdByRole')
                .leftJoinAndSelect('task.runAsUser', 'runAsUser')
                .leftJoinAndSelect('runAsUser.role', 'runAsUserRole')
                .where('task.id = :taskId', { taskId: expiredExecution.taskId })
                .andWhere('task.tenantId = :tenantId', { tenantId: expiredExecution.tenantId })
                .andWhere('task.status = :status', { status: ScheduleTaskStatus.SCHEDULED })
                .getOne()
            if (!task) {
                continue
            }
            const actor = task.runAsUser ?? task.createdBy
            if (!actor || !task.xpertId) {
                if (task.projectId) {
                    const reason = !actor
                        ? t('server-ai:Error.ProjectTaskRunAsUserMissing', {
                              defaultValue: PROJECT_TASK_RUN_AS_USER_MISSING
                          }) || PROJECT_TASK_RUN_AS_USER_MISSING
                        : t('server-ai:Error.ProjectTaskXpertRequired', {
                              defaultValue: PROJECT_TASK_XPERT_REQUIRED
                          }) || PROJECT_TASK_XPERT_REQUIRED
                    const error = new BadRequestException(reason)
                    await this.pauseInvalidProjectTask(task, reason)
                    await this.requireScheduledTaskExecutionCoordinator().finish(
                        expiredExecution,
                        ScheduledTaskExecutionStatus.FAILED,
                        error
                    )
                }
                continue
            }

            await this.runWithTaskRequestContext(task, actor, async () => {
                const claimed = await this.requireScheduledTaskExecutionCoordinator().claim(
                    task,
                    expiredExecution.occurrenceKey,
                    expiredExecution.scheduledAt
                )
                if (claimed) {
                    await this.executeTask(task.id, { timeZone: task.timeZone }, expiredExecution.scheduledAt, claimed)
                }
            }).catch((error) => {
                this.#logger.error(`Scheduled task recovery failed: ${expiredExecution.id} ${getErrorMessage(error)}`)
            })
        }
    }

    private requireScheduledTaskExecutionCoordinator() {
        if (!this.scheduledTaskExecutionCoordinator) {
            throw new Error('Scheduled task execution coordinator is not configured')
        }
        return this.scheduledTaskExecutionCoordinator
    }

    private async finishScheduledTaskExecution(
        task: IXpertTask,
        execution: ScheduledTaskExecution,
        status: ScheduledTaskExecutionStatus,
        error?: unknown
    ) {
        await this.requireScheduledTaskExecutionCoordinator().finish(execution, status, error)
        if (status === ScheduledTaskExecutionStatus.SUCCEEDED && task.options.frequency === TaskFrequency.Once) {
            this.deleteJob(task.id)
            await this.repository.update(task.id, { status: ScheduleTaskStatus.PAUSED })
        }
    }

    private runWithTaskRequestContext<T>(
        task: Pick<IXpertTask, 'tenantId' | 'organizationId'>,
        user: IUser,
        callback: () => T | Promise<T>
    ): Promise<T> {
        if (!user) {
            return Promise.resolve(callback())
        }

        const context = captureRequestContext({
            user,
            tenantId: task.tenantId,
            organizationId: task.organizationId,
            language: user.preferredLanguage
        })
        return runWithCapturedRequestContext(context, callback)
    }

    async removeTasks(tasks: XpertTask[]) {
        tasks.forEach((task) => {
            this.deleteJob(task.id)
        })

        await this.repository.remove(tasks)
    }

    async getActiveJobs() {
        return this.findAll({
            where: {
                status: ScheduleTaskStatus.SCHEDULED
            },
            relations: ['createdBy', 'createdBy.role', 'runAsUser', 'runAsUser.role']
        })
    }

    async assertProjectTaskCanBeCreated(
        task: Pick<IXpertTask, 'projectId' | 'xpertId' | 'runtimeState' | 'tenantId' | 'organizationId'>
    ) {
        if (!task.projectId) return
        if (!task.xpertId) {
            throw new BadRequestException(
                t('server-ai:Error.ProjectTaskXpertRequired', {
                    defaultValue: PROJECT_TASK_XPERT_REQUIRED
                }) || PROJECT_TASK_XPERT_REQUIRED
            )
        }
        const { projectAccessService } = this.getProjectAccessServices()
        await projectAccessService.assertCanManage(task.projectId)
        await this.assertProjectTaskCanRun(task)
        const actor = RequestContext.currentUser()
        if (!actor) {
            throw new ForbiddenException(
                t('server-ai:Error.AuthenticatedUserRequired', { defaultValue: 'An authenticated user is required' })
            )
        }
        await this.assertProjectTaskConnectorSelection(task, actor)
    }

    private async assertProjectTaskCanBeManaged(task: Pick<IXpertTask, 'projectId'>) {
        if (!task.projectId) return
        const { projectAccessService } = this.getProjectAccessServices()
        await projectAccessService.assertCanManage(task.projectId)
    }

    private async assertProjectTaskCanRun(
        task: Pick<IXpertTask, 'projectId' | 'xpertId' | 'tenantId' | 'organizationId'>
    ) {
        if (!task.projectId) return
        if (!task.xpertId) {
            throw new BadRequestException(
                t('server-ai:Error.ProjectTaskXpertRequired', {
                    defaultValue: PROJECT_TASK_XPERT_REQUIRED
                }) || PROJECT_TASK_XPERT_REQUIRED
            )
        }
        const currentXpertId = await this.resolveProjectTaskCurrentXpertId(task, task.xpertId)
        task.xpertId = currentXpertId
        const { projectAccessService, publishedXpertAccessService } = this.getProjectAccessServices()
        await projectAccessService.assertCanUseXpert(task.projectId, currentXpertId)
        await publishedXpertAccessService.getAccessiblePublishedXpert(currentXpertId)
    }

    private getProjectAccessServices() {
        if (!this.projectAccessService || !this.publishedXpertAccessService) {
            throw new Error(
                t('server-ai:Error.ProjectTaskAccessUnavailable', { defaultValue: PROJECT_TASK_ACCESS_UNAVAILABLE }) ||
                    PROJECT_TASK_ACCESS_UNAVAILABLE
            )
        }
        return {
            projectAccessService: this.projectAccessService,
            publishedXpertAccessService: this.publishedXpertAccessService
        }
    }

    private requireProjectTaskRunAsScope(task: XpertTask) {
        const projectId = task.projectId?.trim()
        const xpertId = task.xpertId?.trim()
        if (!projectId || !xpertId) {
            throw new BadRequestException(
                t('server-ai:Error.ProjectTaskRunAsProjectRequired', {
                    defaultValue: PROJECT_TASK_RUN_AS_PROJECT_REQUIRED
                }) || PROJECT_TASK_RUN_AS_PROJECT_REQUIRED
            )
        }
        return { projectId, xpertId }
    }

    private requireCurrentUserId() {
        const userId = RequestContext.currentUserId()?.trim()
        if (!userId) {
            throw new ForbiddenException(
                t('server-ai:Error.AuthenticatedUserRequired', {
                    defaultValue: 'An authenticated user is required'
                })
            )
        }
        return userId
    }

    private async assertProjectTaskRunAsTarget(
        task: XpertTask,
        projectId: string,
        xpertId: string,
        targetUserId: string
    ) {
        const targetUser = await this.userRepository.findOne({
            where: { id: targetUserId, tenantId: task.tenantId, type: UserType.USER },
            relations: ['role']
        })
        if (!targetUser) {
            throw new BadRequestException(
                t('server-ai:Error.ProjectTaskRunAsTargetNotFound', {
                    defaultValue: PROJECT_TASK_RUN_AS_TARGET_NOT_FOUND
                }) || PROJECT_TASK_RUN_AS_TARGET_NOT_FOUND
            )
        }

        const currentXpertId = await this.resolveProjectTaskCurrentXpertId(task, xpertId)
        const { projectAccessService, publishedXpertAccessService } = this.getProjectAccessServices()
        await projectAccessService.assertCanUseXpert(projectId, currentXpertId, {
            tenantId: task.tenantId,
            organizationId: task.organizationId,
            userId: targetUserId
        })
        await this.runWithTaskRequestContext(task, targetUser, () =>
            publishedXpertAccessService.getAccessiblePublishedXpert(currentXpertId)
        )
        return { user: targetUser, xpertId: currentXpertId }
    }

    private async resolveProjectTaskCurrentXpertId(
        task: Pick<IXpertTask, 'projectId' | 'tenantId' | 'organizationId'>,
        xpertId: string
    ) {
        if (!task.projectId) return xpertId

        const currentXpert = await this.projectXpertBindingService.resolveCurrentById(xpertId, {
            tenantId: task.tenantId?.trim() || RequestContext.currentTenantId(),
            organizationId: task.organizationId ?? RequestContext.getOrganizationId()
        })
        if (!currentXpert) {
            throw new BadRequestException(
                t('server-ai:Error.ProjectXpertRequired', {
                    defaultValue: 'The Xpert is not part of this Project'
                })
            )
        }
        return currentXpert.id
    }

    private async pauseInvalidProjectTask(task: Pick<XpertTask, 'id' | 'projectId'>, statusReason: string) {
        if (!task.projectId) return
        this.deleteJob(task.id)
        await this.repository.update(task.id, {
            status: ScheduleTaskStatus.PAUSED,
            statusReason
        })
    }

    private async assertProjectTaskConnectorsCanRun(
        task: Pick<IXpertTask, 'tenantId' | 'organizationId' | 'projectId' | 'xpertId'>,
        actor: IUser,
        runtimeState: TXpertChatState | null,
        conversationId: string,
        executionId: string
    ) {
        if (!task.projectId) return
        const bindingIds = getRuntimeConnectorBindingIds(runtimeState?.[STATE_VARIABLE_HUMAN]?.runtimeCapabilities)
        if (!bindingIds.length) return
        await this.connectorService.resolveSelectedRuntimeBindings(bindingIds, {
            tenantId: task.tenantId,
            organizationId: task.organizationId,
            userId: actor.id,
            projectId: task.projectId,
            xpertId: task.xpertId,
            conversationId,
            executionId,
            connectorBindingIds: bindingIds
        })
    }

    private async assertProjectTaskConnectorSelection(
        task: Pick<
            IXpertTask,
            'id' | 'tenantId' | 'organizationId' | 'projectId' | 'xpertId' | 'runtimeState' | 'createdById'
        >,
        actor: IUser
    ) {
        const projectId = task.projectId?.trim()
        const xpertId = task.xpertId?.trim()
        if (!projectId || !xpertId) return
        const bindingIds = getRuntimeConnectorBindingIds(task.runtimeState?.[STATE_VARIABLE_HUMAN]?.runtimeCapabilities)
        if (!bindingIds.length) return

        const tenantId = task.tenantId?.trim() || RequestContext.currentTenantId()
        const organizationId = task.organizationId ?? RequestContext.getOrganizationId()
        await this.runWithTaskRequestContext(
            {
                ...task,
                tenantId,
                organizationId
            },
            actor,
            () =>
                this.connectorService.resolveSelectedRuntimeBindings(bindingIds, {
                    tenantId,
                    organizationId,
                    userId: actor.id,
                    projectId,
                    xpertId,
                    conversationId: `task-preflight:${task.id ?? 'new'}`,
                    executionId: randomUUID(),
                    connectorBindingIds: bindingIds
                })
        ).catch((error) => {
            const detail = getErrorMessage(error)
            throw new BadRequestException(
                t('server-ai:Error.ProjectTaskConnectorSelectionUnavailable', {
                    reason: detail,
                    defaultValue: `A selected Connector is not available to the run-as user: ${detail}`
                }) || `A selected Connector is not available to the run-as user: ${detail}`
            )
        })
    }

    private async assertProjectTaskMutationAccess(existingTask: XpertTask, updateEntity: XpertTaskMutation) {
        const projectId = existingTask.projectId?.trim()
        if (!projectId) return

        const { projectAccessService } = this.getProjectAccessServices()
        let manageError: unknown
        try {
            await projectAccessService.assertCanManage(projectId)
        } catch (error) {
            manageError = error
        }

        const currentRuntimeState = existingTask.runtimeState
        const nextRuntimeState = Object.prototype.hasOwnProperty.call(updateEntity, 'runtimeState')
            ? updateEntity.runtimeState
            : currentRuntimeState
        const currentBindingIds = getTaskConnectorBindingIds(currentRuntimeState)
        const nextBindingIds = getTaskConnectorBindingIds(nextRuntimeState)
        const changedBindingIds = symmetricStringDifference(currentBindingIds, nextBindingIds)

        if (!changedBindingIds.length) {
            if (manageError) throw manageError
            return
        }

        const bindings = await this.connectorService.listBindings({ type: 'project', projectId })
        const authorizationModeById = new Map(bindings.map((binding) => [binding.id, binding.authorizationMode]))
        const currentBindingIdSet = new Set(currentBindingIds)
        const nextBindingIdSet = new Set(nextBindingIds)
        const actorId = RequestContext.currentUserId()?.trim()
        const runAsUserId = (existingTask.runAsUserId ?? existingTask.createdById)?.trim()
        const changesPersonalBinding = changedBindingIds.some(
            (bindingId) => authorizationModeById.get(bindingId) === 'personal'
        )

        if (!manageError) {
            if (changesPersonalBinding && (!actorId || actorId !== runAsUserId)) {
                throw new ForbiddenException(
                    t('server-ai:Error.ProjectTaskPersonalConnectorRunAsOnly', {
                        defaultValue: PROJECT_TASK_PERSONAL_CONNECTOR_RUN_AS_ONLY
                    }) || PROJECT_TASK_PERSONAL_CONNECTOR_RUN_AS_ONLY
                )
            }
            return
        }

        if (!actorId || actorId !== runAsUserId) throw manageError
        const mutationKeys = XPERT_TASK_MUTATION_KEYS.filter((key) =>
            Object.prototype.hasOwnProperty.call(updateEntity, key)
        )
        if (
            mutationKeys.some((key) => key !== 'runtimeState') ||
            !isEqual(
                runtimeStateWithoutConnectorSelection(currentRuntimeState),
                runtimeStateWithoutConnectorSelection(nextRuntimeState)
            )
        ) {
            throw manageError
        }

        const changesNonPersonalBinding = changedBindingIds.some((bindingId) => {
            const mode = authorizationModeById.get(bindingId)
            const removesMissingBinding =
                !mode && currentBindingIdSet.has(bindingId) && !nextBindingIdSet.has(bindingId)
            return mode !== 'personal' && !removesMissingBinding
        })
        if (changesNonPersonalBinding) throw manageError
    }

    private async invalidatePendingRunAsProposalForConfigurationChange(
        existingTask: XpertTask,
        xpertId: string,
        runtimeState: TXpertChatState | null | undefined
    ) {
        if (
            !existingTask.pendingRunAsUserId ||
            buildProjectTaskRunAsConfigurationHash(existingTask) ===
                buildProjectTaskRunAsConfigurationHash({ ...existingTask, xpertId, runtimeState })
        ) {
            return
        }

        const update = {
            pendingRunAsUserId: null,
            pendingRunAsRequestedById: null,
            pendingRunAsRequestedAt: null,
            pendingRunAsConfigurationHash: null
        }
        const result = await this.repository.update(
            {
                id: existingTask.id,
                pendingRunAsUserId: existingTask.pendingRunAsUserId,
                pendingRunAsConfigurationHash: existingTask.pendingRunAsConfigurationHash ?? IsNull()
            },
            update
        )
        if (result.affected !== 1) {
            throw new BadRequestException(
                t('server-ai:Error.ProjectTaskRunAsProposalChanged', {
                    defaultValue: PROJECT_TASK_RUN_AS_PROPOSAL_CHANGED
                }) || PROJECT_TASK_RUN_AS_PROPOSAL_CHANGED
            )
        }
        Object.assign(existingTask, update)
    }

    async getScheduleCapabilities(xpertId: string, agentKey?: string | null): Promise<TXpertTaskScheduleCapabilities> {
        const xpert = await this.xpertService.findOne(xpertId, { relations: ['agent'] })
        const resolvedAgentKey = normalizeOptionalString(agentKey) || xpert.agent?.key
        const graph = xpert.graph
        const stateSchema =
            graph && resolvedAgentKey
                ? await discoverScheduleStateSchemaFromGraph(
                      graph,
                      resolvedAgentKey,
                      this.agentMiddlewareRegistry,
                      xpertId
                  )
                : null

        return {
            xpertId,
            ...(resolvedAgentKey ? { agentKey: resolvedAgentKey } : {}),
            stateVariables: [],
            ...(stateSchema ? { stateSchema } : {})
        }
    }

    rescheduleTask(task: IXpertTask, user: IUser) {
        try {
            const job = this.schedulerRegistry.getCronJob(task.id)
            if (job) {
                this.schedulerRegistry.deleteCronJob(task.id)
            }
        } catch (err) {
            //
        }

        this.scheduleCronJob(task, user)
    }

    deleteJob(id: string) {
        try {
            const job = this.schedulerRegistry.getCronJob(id)
            if (job) {
                this.schedulerRegistry.deleteCronJob(id)
            }
        } catch (err) {
            //
        }
    }

    @OnEvent('xpert-project.member-removed')
    async pauseProjectTasksForRemovedMember(event: ProjectMemberRemovedEvent) {
        const organizationId = event.organizationId ?? IsNull()
        const tasks = await this.repository.find({
            where: [
                {
                    tenantId: event.tenantId,
                    organizationId,
                    projectId: event.projectId,
                    runAsUserId: event.userId
                },
                {
                    tenantId: event.tenantId,
                    organizationId,
                    projectId: event.projectId,
                    runAsUserId: IsNull(),
                    createdById: event.userId
                }
            ]
        })
        const pausedTaskState = {
            status: ScheduleTaskStatus.PAUSED,
            statusReason: t('server-ai:Error.ProjectTaskRunAsMembershipRemoved', {
                defaultValue: 'The run-as user is no longer a member of this Project'
            })
        }

        for (const task of tasks) {
            if (task.status === ScheduleTaskStatus.ARCHIVED) continue
            this.deleteJob(task.id)
            await this.repository.update(task.id, pausedTaskState)
        }
    }

    @OnEvent('xpert-project.xpert-removed')
    async pauseProjectTasksForRemovedXpert(event: ProjectXpertRemovedEvent) {
        const tasks = await this.repository.find({
            where: {
                tenantId: event.tenantId,
                organizationId: event.organizationId ?? IsNull(),
                projectId: event.projectId,
                xpertId: In(event.xpertIds)
            }
        })
        const pausedTaskState = {
            status: ScheduleTaskStatus.PAUSED,
            statusReason: t('server-ai:Error.ProjectTaskXpertRemoved', {
                defaultValue: 'The scheduled Xpert is no longer part of this Project'
            })
        }

        for (const task of tasks) {
            if (task.status === ScheduleTaskStatus.ARCHIVED) continue
            this.deleteJob(task.id)
            await this.repository.update(task.id, pausedTaskState)
        }
    }

    /**
     * Update task and reschedule if necessary
     */
    async updateTask(id: string, entity: Partial<IXpertTask>) {
        const existingTask = await this.findOne(id)
        const updateEntity = sanitizeTaskMutationInput(entity)
        await this.assertProjectTaskMutationAccess(existingTask, updateEntity)
        if (existingTask.projectId) {
            let xpertId = updateEntity.xpertId ?? existingTask.xpertId
            if (!xpertId) {
                throw new BadRequestException(
                    t('server-ai:Error.ProjectTaskXpertRequired', {
                        defaultValue: PROJECT_TASK_XPERT_REQUIRED
                    }) || PROJECT_TASK_XPERT_REQUIRED
                )
            }
            xpertId = await this.resolveProjectTaskCurrentXpertId(existingTask, xpertId)
            if (xpertId !== existingTask.xpertId || Object.prototype.hasOwnProperty.call(updateEntity, 'xpertId')) {
                updateEntity.xpertId = xpertId
            }
            const runAsUserId = existingTask.runAsUserId ?? existingTask.createdById
            const { user: runAsUser } = await this.assertProjectTaskRunAsTarget(
                existingTask,
                existingTask.projectId,
                xpertId,
                runAsUserId
            )
            const runtimeState = Object.prototype.hasOwnProperty.call(updateEntity, 'runtimeState')
                ? updateEntity.runtimeState
                : existingTask.runtimeState
            await this.assertProjectTaskConnectorSelection(
                {
                    ...existingTask,
                    xpertId,
                    runtimeState
                },
                runAsUser
            )
            await this.invalidatePendingRunAsProposalForConfigurationChange(existingTask, xpertId, runtimeState)
        }
        await super.update(id, updateEntity)
        const task = await this.findOne(id, {
            relations: ['xpert', 'createdBy', 'createdBy.role', 'runAsUser', 'runAsUser.role']
        })
        if (task.status === ScheduleTaskStatus.SCHEDULED) {
            await this.repository.update(id, { statusReason: null })
            this.rescheduleTask(task, task.runAsUser ?? RequestContext.currentUser() ?? task.createdBy)
        } else {
            this.deleteJob(task.id)
        }
        return task
    }

    async schedule(id: string) {
        const task = await this.findOne(id, {
            relations: ['createdBy', 'createdBy.role', 'runAsUser', 'runAsUser.role']
        })
        await this.assertProjectTaskCanBeManaged(task)
        const runAsUser = task.runAsUser ?? task.createdBy
        let xpertIdChanged = false
        if (task.projectId && runAsUser) {
            if (!task.xpertId) {
                throw new BadRequestException(
                    t('server-ai:Error.ProjectTaskXpertRequired', {
                        defaultValue: PROJECT_TASK_XPERT_REQUIRED
                    }) || PROJECT_TASK_XPERT_REQUIRED
                )
            }
            const currentXpertId = await this.resolveProjectTaskCurrentXpertId(task, task.xpertId)
            xpertIdChanged = currentXpertId !== task.xpertId
            task.xpertId = currentXpertId
            await this.assertProjectTaskConnectorSelection(task, runAsUser)
        }
        this.rescheduleTask(task, runAsUser ?? RequestContext.currentUser())
        return await this.update(id, {
            status: ScheduleTaskStatus.SCHEDULED,
            statusReason: null,
            ...(xpertIdChanged ? { xpertId: task.xpertId } : {})
        })
    }

    async pause(id: string) {
        const task = await this.findOne(id)
        await this.assertProjectTaskCanBeManaged(task)
        this.deleteJob(task.id)
        return await this.update(id, { status: ScheduleTaskStatus.PAUSED })
    }

    async archive(id: string) {
        const task = await this.findOne(id)
        await this.assertProjectTaskCanBeManaged(task)
        this.deleteJob(task.id)
        return await this.update(id, { status: ScheduleTaskStatus.ARCHIVED })
    }

    async unarchive(id: string) {
        const task = await this.findOne(id)
        await this.assertProjectTaskCanBeManaged(task)
        this.deleteJob(task.id)
        return await this.update(id, { status: ScheduleTaskStatus.PAUSED })
    }

    async test(id: string, options: TChatOptions) {
        const task = await this.findOne(id)
        await this.assertProjectTaskCanBeManaged(task)
        return await this.executeTask(id, options)
    }

    private async resolveTaskRuntimeState(task: IXpertTask, scheduledAt?: Date): Promise<TXpertChatState | null> {
        const state: TXpertChatState = task.runtimeState ? { ...task.runtimeState } : {}
        const idempotencyKey = buildScheduleIdempotencyKey(task, scheduledAt)

        return {
            ...state,
            [XPERT_TASK_SCHEDULE_IDEMPOTENCY_KEY]: idempotencyKey
        }
    }

    private resolveScheduleScope() {
        const tenantId = RequestContext.currentTenantId()
        const organizationId = RequestContext.getOrganizationId()
        const userId = RequestContext.currentUserId()

        if (!tenantId || !userId) {
            throw new BadRequestException('Missing tenant or user scope')
        }

        return {
            tenantId,
            organizationId: organizationId ?? null,
            userId
        }
    }

    private createScopedXpertTaskTemplateQuery(scope: {
        tenantId: string
        organizationId: string | null
        userId: string
        source?: string | null
    }): SelectQueryBuilder<XpertTaskTemplate> {
        const query = this.xpertTaskTemplateRepository
            .createQueryBuilder('template')
            .where('template."tenantId" = :tenantId', { tenantId: scope.tenantId })
            .andWhere('template."createdById" = :createdById', { createdById: scope.userId })

        if (scope.organizationId) {
            query.andWhere('template."organizationId" = :organizationId', {
                organizationId: scope.organizationId
            })
        } else {
            query.andWhere('template."organizationId" IS NULL')
        }

        if (scope.source) {
            query.andWhere('template."source" = :source', { source: scope.source })
        }

        return query
    }

    private applyTenantXpertTaskTemplateScope(
        query: SelectQueryBuilder<XpertTaskTemplate>,
        tenantId: string
    ): SelectQueryBuilder<XpertTaskTemplate> {
        query.andWhere('template."tenantId" = :tenantId', { tenantId }).andWhere('template."organizationId" IS NULL')
        return query
    }

    private async assertXpertTaskTemplateKeyAvailable(
        key: string,
        scope: {
            tenantId: string
            organizationId: string | null
            userId: string
            source?: string | null
        },
        excludedId?: string
    ) {
        const builtinQuery = this.xpertTaskTemplateRepository
            .createQueryBuilder('template')
            .where('template."key" = :key', { key })
            .andWhere('template."builtin" = true')
            .andWhere('template."createdById" IS NULL')
        this.applyTenantXpertTaskTemplateScope(builtinQuery, scope.tenantId)
        if (scope.source) {
            builtinQuery.andWhere('template."source" = :source', { source: scope.source })
        }

        const builtinExists = await builtinQuery.getOne()
        if (builtinExists) {
            throw new BadRequestException('Template key already exists')
        }

        const query = this.createScopedXpertTaskTemplateQuery(scope)
            .andWhere('template."builtin" = false')
            .andWhere('template."key" = :key', { key })
        if (excludedId) {
            query.andWhere('template.id != :id', { id: excludedId })
        }

        const exists = await query.getOne()
        if (exists) {
            throw new BadRequestException('Template key already exists')
        }
    }

    private parseDateOnly(input: string | undefined): string {
        const value = typeof input === 'string' ? input.trim() : ''
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            throw new BadRequestException('Expected date format YYYY-MM-DD')
        }
        const parsed = new Date(`${value}T00:00:00.000Z`)
        if (!Number.isFinite(parsed.getTime())) {
            throw new BadRequestException('Invalid date value')
        }
        const normalized = `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, '0')}-${String(parsed.getUTCDate()).padStart(2, '0')}`
        if (normalized !== value) {
            throw new BadRequestException('Invalid calendar date')
        }
        return value
    }

    private addDays(date: string, days: number): string {
        const next = new Date(`${date}T00:00:00.000Z`)
        next.setUTCDate(next.getUTCDate() + days)
        return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`
    }

    private parseReminder(value: string | null | undefined): Date | null {
        if (!value) {
            return null
        }
        const parsed = new Date(value)
        if (!Number.isFinite(parsed.getTime())) {
            throw new BadRequestException('Invalid remindAt value')
        }
        return parsed
    }

    private normalizeNoteType(value: string | undefined): ScheduleNoteType {
        return value === 'task' ? 'task' : 'note'
    }

    private normalizeNoteStatus(value: string | undefined): ScheduleNoteStatus {
        return value === 'done' ? 'done' : 'pending'
    }

    private normalizeOptionalText(value: string | null | undefined): string | null {
        if (typeof value !== 'string') {
            return null
        }
        const trimmed = value.trim()
        return trimmed ? trimmed : null
    }

    async getScheduleOverview(from: string | undefined, to: string | undefined) {
        const { tenantId, organizationId, userId } = this.resolveScheduleScope()
        const now = new Date()
        const defaultFrom = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`
        const defaultTo = this.addDays(defaultFrom, 41)
        const fromDate = this.parseDateOnly(from ?? defaultFrom)
        const toDate = this.parseDateOnly(to ?? defaultTo)
        if (fromDate > toDate) {
            throw new BadRequestException('from date must not be later than to date')
        }

        const notes = await this.scheduleNoteRepository.find({
            where: {
                tenantId,
                organizationId,
                createdById: userId,
                date: Between(fromDate, toDate)
            },
            order: { date: 'ASC' }
        })

        const conversations = await this.chatConversationRepository
            .createQueryBuilder('conversation')
            .select(`TO_CHAR(conversation."createdAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD')`, 'date')
            .addSelect('COUNT(*)', 'total')
            .where('conversation."tenantId" = :tenantId', { tenantId })
            .andWhere('conversation."organizationId" IS NOT DISTINCT FROM :organizationId', { organizationId })
            .andWhere('conversation."createdById" = :createdById', { createdById: userId })
            .andWhere('conversation."createdAt" >= :fromDate', { fromDate: `${fromDate}T00:00:00.000Z` })
            .andWhere('conversation."createdAt" < :toExclusive', {
                toExclusive: `${this.addDays(toDate, 1)}T00:00:00.000Z`
            })
            .groupBy('date')
            .getRawMany<{ date: string; total: string }>()

        const noteByDate = new Map<string, { total: number; done: number }>()
        for (const note of notes) {
            const existing = noteByDate.get(note.date) ?? { total: 0, done: 0 }
            existing.total += 1
            if (note.status === 'done') {
                existing.done += 1
            }
            noteByDate.set(note.date, existing)
        }

        const convoByDate = new Map<string, number>()
        for (const row of conversations) {
            convoByDate.set(row.date, Number(row.total) || 0)
        }

        const days: Array<{
            date: string
            totalCount: number
            customCount: number
            codexpertCount: number
            completedCount: number
            intensity: number
        }> = []

        let totalCount = 0
        let peakCount = 0
        let peakDate: string | null = null

        let cursor = fromDate
        while (cursor <= toDate) {
            const customCount = noteByDate.get(cursor)?.total ?? 0
            const completedCount = noteByDate.get(cursor)?.done ?? 0
            const codexpertCount = convoByDate.get(cursor) ?? 0
            const dayTotal = customCount + codexpertCount
            totalCount += dayTotal
            if (dayTotal > peakCount) {
                peakCount = dayTotal
                peakDate = cursor
            }
            days.push({
                date: cursor,
                totalCount: dayTotal,
                customCount,
                codexpertCount,
                completedCount,
                intensity: 0
            })
            cursor = this.addDays(cursor, 1)
        }

        const max = peakCount || 1
        for (const day of days) {
            day.intensity = Number((day.totalCount / max).toFixed(2))
        }

        const activeDays = days.filter((day) => day.totalCount > 0).length

        return {
            from: fromDate,
            to: toDate,
            days,
            metrics: {
                totalCount,
                activeDays,
                completionRate:
                    totalCount > 0
                        ? Number(
                              ((days.reduce((sum, day) => sum + day.completedCount, 0) / totalCount) * 100).toFixed(2)
                          )
                        : 0,
                peakDate
            }
        }
    }

    async getScheduleDay(date: string) {
        const { tenantId, organizationId, userId } = this.resolveScheduleScope()
        const targetDate = this.parseDateOnly(date)
        const nextDate = this.addDays(targetDate, 1)

        const [notes, conversations, autoTasks] = await Promise.all([
            this.scheduleNoteRepository.find({
                where: {
                    tenantId,
                    organizationId,
                    createdById: userId,
                    date: targetDate
                },
                order: { createdAt: 'ASC' }
            }),
            this.chatConversationRepository
                .createQueryBuilder('conversation')
                .where('conversation."tenantId" = :tenantId', { tenantId })
                .andWhere('conversation."organizationId" IS NOT DISTINCT FROM :organizationId', { organizationId })
                .andWhere('conversation."createdById" = :createdById', { createdById: userId })
                .andWhere('conversation."createdAt" >= :startDate', { startDate: `${targetDate}T00:00:00.000Z` })
                .andWhere('conversation."createdAt" < :endDate', { endDate: `${nextDate}T00:00:00.000Z` })
                .orderBy('conversation."createdAt"', 'ASC')
                .getMany(),
            this.listAutoTasks()
        ])

        const autoTaskByNoteId = new Map<string, AutoTask>()
        const remainingAutoTasks = [...autoTasks]

        for (const note of notes) {
            const directMatch = remainingAutoTasks.find((task) => this.readScheduleNoteId(task.params) === note.id)
            if (directMatch) {
                autoTaskByNoteId.set(note.id as string, directMatch)
                remainingAutoTasks.splice(remainingAutoTasks.indexOf(directMatch), 1)
            }
        }

        for (const note of notes) {
            const noteId = note.id as string
            if (autoTaskByNoteId.has(noteId)) {
                continue
            }
            const fallbackMatch = remainingAutoTasks.find((task) =>
                this.matchesScheduleNoteFallback(task, note, targetDate)
            )
            if (fallbackMatch) {
                autoTaskByNoteId.set(noteId, fallbackMatch)
                remainingAutoTasks.splice(remainingAutoTasks.indexOf(fallbackMatch), 1)
            }
        }

        const noteItems = notes.map((note) => ({
            id: note.id as string,
            source: 'custom' as const,
            type: autoTaskByNoteId.has(note.id as string) ? 'automation' : note.type,
            status: note.status,
            title: note.title,
            content: note.content ?? null,
            date: note.date,
            time: this.resolveScheduleItemTime(note, autoTaskByNoteId.get(note.id as string)),
            remindAt: note.remindAt ? note.remindAt.toISOString() : null,
            autoTask: this.serializeScheduleAutoTask(autoTaskByNoteId.get(note.id as string))
        }))

        const conversationItems = conversations.map((conversation) => {
            const titleText =
                typeof conversation.title === 'string' && conversation.title.trim()
                    ? conversation.title.trim()
                    : 'Conversation'
            return {
                id: conversation.id as string,
                source: 'codexpert' as const,
                type: 'conversation',
                status: conversation.status ?? 'unknown',
                title: titleText,
                content: null,
                date: targetDate,
                time: conversation.createdAt
                    ? `${String(conversation.createdAt.getHours()).padStart(2, '0')}:${String(conversation.createdAt.getMinutes()).padStart(2, '0')}`
                    : null,
                remindAt: null
            }
        })

        return {
            date: targetDate,
            items: [...noteItems, ...conversationItems].sort((left, right) =>
                (left.time ?? '').localeCompare(right.time ?? '')
            )
        }
    }

    async createScheduleNote(payload: {
        title: string
        content?: string | null
        date: string
        remindAt?: string | null
        type?: string
        status?: string
    }) {
        const { tenantId, organizationId, userId } = this.resolveScheduleScope()
        const title = payload.title?.trim()
        if (!title) {
            throw new BadRequestException('Title is required')
        }
        const note = this.scheduleNoteRepository.create({
            tenantId,
            organizationId,
            createdById: userId,
            title,
            content: this.normalizeOptionalText(payload.content),
            date: this.parseDateOnly(payload.date),
            remindAt: this.parseReminder(payload.remindAt),
            type: this.normalizeNoteType(payload.type),
            status: this.normalizeNoteStatus(payload.status)
        })
        return this.scheduleNoteRepository.save(note)
    }

    async createScheduleNoteWithAutoTask(payload: {
        title: string
        content?: string | null
        date: string
        remindAt?: string | null
        type?: string
        status?: string
        autoTask?: {
            title?: string
            description?: string | null
            prompt?: string
            repo?: string
            branch?: string
            schedule?: string
            frequency?: string
            enabled?: boolean
            templateId?: string | null
            runAt?: string | null
            timeZone?: string | null
            pushChannel?: string | null
            params?: Record<string, unknown> | null
        } | null
    }) {
        const note = await this.createScheduleNote(payload)
        if (!payload.autoTask) {
            return note
        }

        let createdAutoTaskId: string | null = null
        try {
            const autoTask = await this.createAutoTask({
                ...payload.autoTask,
                params: {
                    ...(payload.autoTask.params ?? {}),
                    scheduleNoteId: note.id
                }
            })
            createdAutoTaskId = autoTask.id as string
            note.remindAt = this.resolveScheduleNoteReminder(autoTask, note.date)
            await this.scheduleNoteRepository.save(note)
            return note
        } catch (error) {
            if (createdAutoTaskId) {
                try {
                    await this.deleteAutoTask(createdAutoTaskId)
                } catch (rollbackError) {
                    this.#logger.error(
                        `Failed to rollback auto task ${createdAutoTaskId}: ${getErrorMessage(rollbackError)}`
                    )
                }
            }
            try {
                await this.scheduleNoteRepository.remove(note)
            } catch (rollbackError) {
                this.#logger.error(`Failed to rollback schedule note ${note.id}: ${getErrorMessage(rollbackError)}`)
            }
            throw error
        }
    }

    async updateScheduleNote(
        id: string,
        payload: {
            title?: string
            content?: string | null
            date?: string
            remindAt?: string | null
            type?: string
            status?: string
            autoTask?: {
                title?: string
                description?: string | null
                prompt?: string
                repo?: string
                branch?: string
                schedule?: string
                frequency?: string
                enabled?: boolean
                templateId?: string | null
                runAt?: string | null
                timeZone?: string | null
                pushChannel?: string | null
                params?: Record<string, unknown> | null
            } | null
        }
    ) {
        const { tenantId, organizationId, userId } = this.resolveScheduleScope()
        const note = await this.scheduleNoteRepository.findOne({
            where: {
                id,
                tenantId,
                organizationId,
                createdById: userId
            }
        })
        if (!note) {
            throw new BadRequestException('Schedule note not found')
        }
        const existingAutoTask = await this.findLinkedAutoTaskForNote(note)
        const originalNoteState = this.snapshotScheduleNoteState(note)
        const originalAutoTaskPayload = existingAutoTask ? this.snapshotScheduleAutoTaskPayload(existingAutoTask) : null
        let createdAutoTaskId: string | null = null
        let autoTaskDeleted = false
        let autoTaskUpdated = false

        if (payload.title !== undefined) {
            const title = payload.title.trim()
            if (!title) {
                throw new BadRequestException('Title is required')
            }
            note.title = title
        }
        if (payload.content !== undefined) {
            note.content = this.normalizeOptionalText(payload.content)
        }
        if (payload.date !== undefined) {
            note.date = this.parseDateOnly(payload.date)
        }
        if (payload.remindAt !== undefined) {
            note.remindAt = this.parseReminder(payload.remindAt)
        }
        if (payload.type !== undefined) {
            note.type = this.normalizeNoteType(payload.type)
        }
        if (payload.status !== undefined) {
            note.status = this.normalizeNoteStatus(payload.status)
        }

        if (payload.autoTask !== undefined) {
            if (payload.autoTask) {
                note.type = 'task'
            }
            if (payload.autoTask === null && payload.type === undefined && existingAutoTask) {
                note.type = 'note'
            }
        }

        let savedNote = note
        try {
            savedNote = await this.scheduleNoteRepository.save(note)

            if (payload.autoTask !== undefined) {
                if (payload.autoTask === null) {
                    if (existingAutoTask) {
                        await this.deleteAutoTask(existingAutoTask.id)
                        autoTaskDeleted = true
                    }
                } else {
                    const nextAutoTask = existingAutoTask
                        ? await this.updateAutoTask(existingAutoTask.id, {
                              ...payload.autoTask,
                              params: {
                                  ...(payload.autoTask.params ?? {}),
                                  date: savedNote.date,
                                  scheduleNoteId: savedNote.id
                              }
                          })
                        : await this.createAutoTask({
                              ...payload.autoTask,
                              params: {
                                  ...(payload.autoTask.params ?? {}),
                                  date: savedNote.date,
                                  scheduleNoteId: savedNote.id
                              }
                          })
                    if (existingAutoTask) {
                        autoTaskUpdated = true
                    } else {
                        createdAutoTaskId = nextAutoTask.id as string
                    }
                    savedNote.remindAt = this.resolveScheduleNoteReminder(nextAutoTask, savedNote.date)
                    savedNote = await this.scheduleNoteRepository.save(savedNote)
                }
            }

            return savedNote
        } catch (error) {
            await this.rollbackScheduleNoteUpdate(note.id as string, originalNoteState, {
                existingAutoTaskId: existingAutoTask?.id as string | null,
                originalAutoTaskPayload,
                createdAutoTaskId,
                autoTaskDeleted,
                autoTaskUpdated
            })
            throw error
        }
    }

    async deleteScheduleNote(id: string) {
        const { tenantId, organizationId, userId } = this.resolveScheduleScope()
        const note = await this.scheduleNoteRepository.findOne({
            where: {
                id,
                tenantId,
                organizationId,
                createdById: userId
            }
        })
        if (!note) {
            throw new BadRequestException('Schedule note not found')
        }
        const autoTask = await this.findLinkedAutoTaskForNote(note)
        const autoTaskPayload = autoTask ? this.snapshotScheduleAutoTaskPayload(autoTask) : null
        let autoTaskDeleted = false
        try {
            if (autoTask) {
                await this.deleteAutoTask(autoTask.id)
                autoTaskDeleted = true
            }
            await this.scheduleNoteRepository.remove(note)
            return { success: true }
        } catch (error) {
            if (autoTask && autoTaskPayload && autoTaskDeleted) {
                try {
                    const restored = await this.createAutoTask(autoTaskPayload)
                    note.remindAt = this.resolveScheduleNoteReminder(restored, note.date)
                    await this.scheduleNoteRepository.save(note)
                } catch (rollbackError) {
                    this.#logger.error(
                        `Failed to rollback auto task for schedule note ${note.id}: ${getErrorMessage(rollbackError)}`
                    )
                }
            }
            throw error
        }
    }

    private readScheduleNoteId(params: Record<string, unknown> | null | undefined): string | null {
        const raw = params?.scheduleNoteId
        return typeof raw === 'string' && raw.trim() ? raw.trim() : null
    }

    private async findLinkedAutoTaskForNote(note: ScheduleNote): Promise<AutoTask | null> {
        const autoTasks = await this.listAutoTasks()
        const directMatch = autoTasks.find((task) => this.readScheduleNoteId(task.params) === note.id)
        if (directMatch) {
            return directMatch
        }
        return autoTasks.find((task) => this.matchesScheduleNoteFallback(task, note, note.date)) ?? null
    }

    private snapshotScheduleNoteState(note: ScheduleNote): {
        title: string
        content: string | null
        date: string
        remindAt: Date | null
        type: ScheduleNoteType
        status: ScheduleNoteStatus
    } {
        return {
            title: note.title,
            content: note.content ?? null,
            date: note.date,
            remindAt: note.remindAt ?? null,
            type: note.type,
            status: note.status
        }
    }

    private snapshotScheduleAutoTaskPayload(task: AutoTask) {
        return {
            title: task.title,
            description: task.description ?? null,
            prompt: task.prompt,
            repo: task.repo,
            branch: task.branch,
            schedule: task.schedule,
            frequency: task.frequency,
            enabled: task.enabled,
            templateId: task.templateId ?? null,
            runAt: task.runAt ? task.runAt.toISOString() : null,
            timeZone: task.timeZone ?? null,
            pushChannel: task.pushChannel ?? null,
            params: task.params ?? null
        }
    }

    private async rollbackScheduleNoteUpdate(
        noteId: string,
        originalNoteState: {
            title: string
            content: string | null
            date: string
            remindAt: Date | null
            type: ScheduleNoteType
            status: ScheduleNoteStatus
        },
        options: {
            existingAutoTaskId: string | null
            originalAutoTaskPayload: ReturnType<XpertTaskService['snapshotScheduleAutoTaskPayload']> | null
            createdAutoTaskId: string | null
            autoTaskDeleted: boolean
            autoTaskUpdated: boolean
        }
    ) {
        const { existingAutoTaskId, originalAutoTaskPayload, createdAutoTaskId, autoTaskDeleted, autoTaskUpdated } =
            options

        try {
            if (createdAutoTaskId) {
                await this.deleteAutoTask(createdAutoTaskId)
            } else if (existingAutoTaskId && originalAutoTaskPayload && autoTaskDeleted) {
                await this.createAutoTask(originalAutoTaskPayload)
            } else if (existingAutoTaskId && originalAutoTaskPayload && autoTaskUpdated) {
                await this.updateAutoTask(existingAutoTaskId, originalAutoTaskPayload)
            }
        } catch (rollbackError) {
            this.#logger.error(
                `Failed to rollback auto task state for schedule note ${noteId}: ${getErrorMessage(rollbackError)}`
            )
        }

        try {
            await this.scheduleNoteRepository.update(noteId, originalNoteState)
        } catch (rollbackError) {
            this.#logger.error(`Failed to rollback schedule note ${noteId}: ${getErrorMessage(rollbackError)}`)
        }
    }

    private readScheduleTaskDate(params: Record<string, unknown> | null | undefined): string | null {
        const raw = params?.date
        return typeof raw === 'string' && raw.trim() ? raw.trim() : null
    }

    private matchesScheduleNoteFallback(task: AutoTask, note: ScheduleNote, date: string): boolean {
        const scheduleDate = this.readScheduleTaskDate(task.params)
        if (scheduleDate && scheduleDate !== date) {
            return false
        }
        if (task.title !== note.title) {
            return false
        }
        return this.normalizeOptionalText(task.description) === this.normalizeOptionalText(note.content)
    }

    private resolveScheduleItemTime(note: ScheduleNote, autoTask?: AutoTask): string | null {
        if (autoTask) {
            if (autoTask.runAt) {
                return `${String(autoTask.runAt.getHours()).padStart(2, '0')}:${String(autoTask.runAt.getMinutes()).padStart(2, '0')}`
            }
            const parsed = this.parseTimeFromCron(autoTask.schedule)
            if (parsed) {
                return parsed
            }
        }
        return note.remindAt
            ? `${String(note.remindAt.getHours()).padStart(2, '0')}:${String(note.remindAt.getMinutes()).padStart(2, '0')}`
            : null
    }

    private serializeScheduleAutoTask(autoTask?: AutoTask) {
        if (!autoTask) {
            return null
        }
        return {
            id: autoTask.id as string,
            title: autoTask.title,
            description: autoTask.description ?? null,
            prompt: autoTask.prompt,
            repo: autoTask.repo,
            branch: autoTask.branch,
            frequency: autoTask.frequency,
            schedule: autoTask.schedule,
            runAt: autoTask.runAt ? autoTask.runAt.toISOString() : null,
            templateId: autoTask.templateId ?? null,
            timeZone: autoTask.timeZone ?? null,
            assistantId: this.resolveAutoTaskAssistantId(autoTask.params)
        }
    }

    private parseTimeFromCron(schedule: string | null | undefined): string | null {
        if (!schedule) {
            return null
        }
        const parts = schedule.trim().split(/\s+/)
        if (parts.length < 2) {
            return null
        }
        const minute = Number(parts[0])
        const hour = Number(parts[1])
        if (!Number.isFinite(minute) || !Number.isFinite(hour)) {
            return null
        }
        return `${String(Math.max(0, Math.min(23, hour))).padStart(2, '0')}:${String(Math.max(0, Math.min(59, minute))).padStart(2, '0')}`
    }

    private resolveScheduleNoteReminder(autoTask: AutoTask, date: string): Date | null {
        if (autoTask.runAt) {
            return autoTask.runAt
        }
        const time = this.parseTimeFromCron(autoTask.schedule)
        if (!time) {
            return null
        }
        const parsed = new Date(`${date}T${time}:00`)
        return Number.isNaN(parsed.getTime()) ? null : parsed
    }

    async listAutoTasks() {
        const { tenantId, organizationId, userId } = this.resolveScheduleScope()
        return this.autoTaskRepository.find({
            where: {
                tenantId,
                organizationId,
                createdById: userId
            },
            order: {
                updatedAt: 'DESC'
            }
        })
    }

    async createAutoTask(payload: {
        title?: string
        description?: string | null
        prompt?: string
        repo?: string
        branch?: string
        schedule?: string
        frequency?: string
        enabled?: boolean
        templateId?: string | null
        runAt?: string | null
        timeZone?: string | null
        pushChannel?: string | null
        params?: Record<string, unknown> | null
    }) {
        const { tenantId, organizationId } = this.resolveScheduleScope()
        const title = this.requireText(payload.title, 'title')
        const prompt = this.requireText(payload.prompt, 'prompt')
        const repo = this.requireText(payload.repo, 'repo')
        const branch = this.requireText(payload.branch, 'branch')
        const schedule = this.requireText(payload.schedule, 'schedule')
        const frequency = this.normalizeAutoTaskFrequency(payload.frequency)
        const params = payload.params ?? null
        this.requireAutoTaskAssistantId(params)
        const templateId = await this.resolveAutoTaskTemplateId(payload.templateId)
        const timeZone = this.resolveAutoTaskTimeZone(
            payload.timeZone ?? RequestContext.currentUser()?.timeZone ?? null
        )

        const task = this.autoTaskRepository.create({
            tenantId,
            organizationId,
            createdById: RequestContext.currentUserId(),
            title,
            description: this.normalizeOptionalText(payload.description),
            prompt,
            repo,
            branch,
            schedule,
            frequency,
            enabled: payload.enabled ?? true,
            templateId,
            runAt: this.parseReminder(payload.runAt),
            timeZone,
            pushChannel: this.normalizeOptionalText(payload.pushChannel),
            params
        })
        task.nextRunAt = this.computeAutoTaskNextRunAt(task)
        return this.autoTaskRepository.save(task)
    }

    async updateAutoTask(
        id: string,
        payload: {
            title?: string
            description?: string | null
            prompt?: string
            repo?: string
            branch?: string
            schedule?: string
            frequency?: string
            enabled?: boolean
            templateId?: string | null
            runAt?: string | null
            timeZone?: string | null
            pushChannel?: string | null
            params?: Record<string, unknown> | null
        }
    ) {
        const { tenantId, organizationId, userId } = this.resolveScheduleScope()
        const task = await this.autoTaskRepository.findOne({
            where: {
                id,
                tenantId,
                organizationId,
                createdById: userId
            }
        })
        if (!task) {
            throw new BadRequestException('Auto task not found')
        }

        if (payload.title !== undefined) {
            task.title = this.requireText(payload.title, 'title')
        }
        if (payload.description !== undefined) {
            task.description = this.normalizeOptionalText(payload.description)
        }
        if (payload.prompt !== undefined) {
            task.prompt = this.requireText(payload.prompt, 'prompt')
        }
        if (payload.repo !== undefined) {
            task.repo = this.requireText(payload.repo, 'repo')
        }
        if (payload.branch !== undefined) {
            task.branch = this.requireText(payload.branch, 'branch')
        }
        if (payload.schedule !== undefined) {
            task.schedule = this.requireText(payload.schedule, 'schedule')
        }
        if (payload.frequency !== undefined) {
            task.frequency = this.normalizeAutoTaskFrequency(payload.frequency)
        }
        if (payload.enabled !== undefined) {
            task.enabled = payload.enabled
        }
        if (payload.templateId !== undefined) {
            task.templateId = await this.resolveAutoTaskTemplateId(payload.templateId)
        }
        if (payload.runAt !== undefined) {
            task.runAt = this.parseReminder(payload.runAt)
        }
        if (payload.timeZone !== undefined) {
            task.timeZone = this.resolveAutoTaskTimeZone(payload.timeZone)
        }
        if (payload.pushChannel !== undefined) {
            task.pushChannel = this.normalizeOptionalText(payload.pushChannel)
        }
        if (payload.params !== undefined) {
            task.params = payload.params ?? null
        }
        this.requireAutoTaskAssistantId(task.params)
        task.nextRunAt = this.computeAutoTaskNextRunAt(task)
        return this.autoTaskRepository.save(task)
    }

    async deleteAutoTask(id: string) {
        const { tenantId, organizationId, userId } = this.resolveScheduleScope()
        const task = await this.autoTaskRepository.findOne({
            where: {
                id,
                tenantId,
                organizationId,
                createdById: userId
            }
        })
        if (!task) {
            throw new BadRequestException('Auto task not found')
        }
        await this.autoTaskRepository.remove(task)
        return { success: true }
    }

    async listAutoTaskTemplates() {
        const { tenantId, organizationId, userId } = this.resolveScheduleScope()
        await this.seedBuiltinAutoTaskTemplates()
        return this.autoTaskTemplateRepository
            .createQueryBuilder('template')
            .where('template.builtin = true')
            .orWhere(
                'template.tenantId = :tenantId and template.organizationId = :organizationId and template.createdById = :createdById',
                { tenantId, organizationId, createdById: userId }
            )
            .orderBy('template.builtin', 'DESC')
            .addOrderBy('template.createdAt', 'DESC')
            .getMany()
    }

    async createAutoTaskTemplate(payload: {
        key?: string
        title?: string
        description?: string | null
        prompt?: string
        defaultParams?: Record<string, unknown> | null
        icon?: string | null
    }) {
        const { tenantId, organizationId, userId } = this.resolveScheduleScope()
        const title = this.requireText(payload.title, 'title')
        const prompt = this.requireText(payload.prompt, 'prompt')
        const key = this.normalizeTemplateKey(payload.key || title)

        const exists = await this.autoTaskTemplateRepository
            .createQueryBuilder('template')
            .where('template.key = :key', { key })
            .andWhere(
                '(template.builtin = true or (template.tenantId = :tenantId and template.organizationId = :organizationId and template.createdById = :createdById))',
                { tenantId, organizationId, createdById: userId }
            )
            .getOne()
        if (exists) {
            throw new BadRequestException('Template key already exists')
        }

        const template = this.autoTaskTemplateRepository.create({
            tenantId,
            organizationId,
            createdById: RequestContext.currentUserId(),
            key,
            title,
            description: this.normalizeOptionalText(payload.description),
            prompt,
            defaultParams: payload.defaultParams ?? null,
            icon: this.normalizeOptionalText(payload.icon),
            builtin: false
        })
        return this.autoTaskTemplateRepository.save(template)
    }

    async listXpertTaskTemplates(source?: string | null) {
        const scope = this.resolveScheduleScope()
        const normalizedSource = this.normalizeTemplateSource(source)

        const builtinTemplateQuery = this.xpertTaskTemplateRepository
            .createQueryBuilder('template')
            .where('template."builtin" = true')
            .andWhere('template."createdById" IS NULL')
            .orderBy('template."createdAt"', 'ASC')
        this.applyTenantXpertTaskTemplateScope(builtinTemplateQuery, scope.tenantId)
        if (normalizedSource) {
            builtinTemplateQuery.andWhere('template."source" = :source', { source: normalizedSource })
        }
        const builtinTemplates = await builtinTemplateQuery.getMany()

        const personalTemplates = await this.createScopedXpertTaskTemplateQuery({
            ...scope,
            source: normalizedSource
        })
            .andWhere('template."builtin" = false')
            .orderBy('template."createdAt"', 'DESC')
            .getMany()

        return [...builtinTemplates, ...personalTemplates]
    }

    async createXpertTaskTemplate(payload: {
        key?: string
        title?: string
        prompt?: string | I18nObject
        defaultOptions?: TScheduleOptions | null
        icon?: string | null
        source?: string | null
        builtin?: boolean
    }) {
        const { tenantId, organizationId, userId } = this.resolveScheduleScope()
        const source = this.normalizeTemplateSource(payload.source)
        const title = this.requireText(payload.title, 'title')
        const prompt = this.normalizeTaskTemplatePrompt(payload.prompt)
        const key = this.normalizeTemplateKey(payload.key || title)

        if (payload.builtin === true) {
            return this.upsertBuiltinXpertTaskTemplate({
                source,
                key,
                title,
                prompt,
                defaultOptions: this.normalizeTaskTemplateOptions(payload.defaultOptions),
                icon: this.normalizeOptionalText(payload.icon)
            })
        }

        await this.assertXpertTaskTemplateKeyAvailable(key, {
            tenantId,
            organizationId,
            userId,
            source
        })

        const template = this.xpertTaskTemplateRepository.create({
            tenantId,
            organizationId,
            createdById: RequestContext.currentUserId(),
            source,
            key,
            title,
            prompt,
            defaultOptions: this.normalizeTaskTemplateOptions(payload.defaultOptions),
            icon: this.normalizeOptionalText(payload.icon),
            builtin: false
        })
        return this.xpertTaskTemplateRepository.save(template)
    }

    private async upsertBuiltinXpertTaskTemplate(payload: {
        source: string | null
        key: string
        title: string
        prompt: string | I18nObject
        defaultOptions: TScheduleOptions | null
        icon: string | null
    }) {
        if (!payload.source) {
            throw new BadRequestException('Template source is required for builtin templates')
        }
        const { tenantId } = this.resolveScheduleScope()

        const templateQuery = this.xpertTaskTemplateRepository
            .createQueryBuilder('template')
            .where('template."builtin" = true')
            .andWhere('template."source" = :source', { source: payload.source })
            .andWhere('template."key" = :key', { key: payload.key })
            .andWhere('template."createdById" IS NULL')
        this.applyTenantXpertTaskTemplateScope(templateQuery, tenantId)
        const existingTemplate = await templateQuery.getOne()

        if (existingTemplate) {
            existingTemplate.title = payload.title
            existingTemplate.prompt = payload.prompt
            existingTemplate.defaultOptions = payload.defaultOptions
            existingTemplate.icon = payload.icon
            return this.xpertTaskTemplateRepository.save(existingTemplate)
        }

        return this.xpertTaskTemplateRepository.save(
            this.xpertTaskTemplateRepository.create({
                tenantId,
                organizationId: null,
                createdById: null,
                source: payload.source,
                key: payload.key,
                title: payload.title,
                prompt: payload.prompt,
                defaultOptions: payload.defaultOptions,
                icon: payload.icon,
                builtin: true
            })
        )
    }

    async updateXpertTaskTemplate(
        id: string,
        payload: {
            key?: string
            title?: string
            prompt?: string | I18nObject
            defaultOptions?: TScheduleOptions | null
            icon?: string | null
        },
        source?: string | null
    ) {
        const { tenantId, organizationId, userId } = this.resolveScheduleScope()
        const normalizedSource = this.normalizeTemplateSource(source)
        const scope = {
            tenantId,
            organizationId,
            userId,
            source: normalizedSource
        }
        const template = await this.createScopedXpertTaskTemplateQuery(scope)
            .andWhere('template.id = :id', { id })
            .andWhere('template."builtin" = false')
            .getOne()
        if (!template) {
            throw new BadRequestException('Xpert task template not found')
        }

        if (payload.key !== undefined) {
            const key = this.normalizeTemplateKey(payload.key)
            if (key !== template.key) {
                await this.assertXpertTaskTemplateKeyAvailable(key, scope, id)
                template.key = key
            }
        }
        if (payload.title !== undefined) {
            template.title = this.requireText(payload.title, 'title')
        }
        if (payload.prompt !== undefined) {
            template.prompt = this.normalizeTaskTemplatePrompt(payload.prompt)
        }
        if (payload.defaultOptions !== undefined) {
            template.defaultOptions = this.normalizeTaskTemplateOptions(payload.defaultOptions)
        }
        if (payload.icon !== undefined) {
            template.icon = this.normalizeOptionalText(payload.icon)
        }

        return this.xpertTaskTemplateRepository.save(template)
    }

    async deleteXpertTaskTemplate(id: string, source?: string | null) {
        const { tenantId, organizationId, userId } = this.resolveScheduleScope()
        const normalizedSource = this.normalizeTemplateSource(source)
        const template = await this.createScopedXpertTaskTemplateQuery({
            tenantId,
            organizationId,
            userId,
            source: normalizedSource
        })
            .andWhere('template.id = :id', { id })
            .andWhere('template."builtin" = false')
            .getOne()
        if (!template) {
            throw new BadRequestException('Xpert task template not found')
        }
        await this.xpertTaskTemplateRepository.remove(template)
        return { success: true }
    }

    @Cron('0 * * * * *')
    async runDueAutoTasks() {
        await this.redisLockService.runWithLock(AUTO_TASK_CRON_LOCK_KEY, AUTO_TASK_CRON_LOCK_TTL, async () => {
            const now = new Date()
            const dueTasks = await this.autoTaskRepository
                .createQueryBuilder('task')
                .leftJoinAndSelect('task.createdBy', 'createdBy')
                .leftJoinAndSelect('createdBy.role', 'createdByRole')
                .where('task.enabled = true')
                .andWhere('task.nextRunAt is not null')
                .andWhere('task.nextRunAt <= :now', { now: now.toISOString() })
                .orderBy('task.nextRunAt', 'ASC')
                .take(20)
                .getMany()

            for (const task of dueTasks) {
                await this.executeAutoTask(task).catch((error) => {
                    this.#logger.error(`Auto task execution failed: ${task.id} ${getErrorMessage(error)}`)
                })
            }
        })
    }

    private async executeAutoTask(task: AutoTask) {
        const assistantId = this.requireAutoTaskAssistantId(task.params)

        const execute = async () => {
            const { observable } = await this.createPersistedTaskChatRun({
                prompt: task.prompt,
                xpertId: assistantId,
                taskId: task.id,
                timeZone: task.timeZone ?? undefined
            })
            await lastValueFrom(observable.pipe(toArray()))
        }

        const createdBy = (task as unknown as { createdBy?: IUser }).createdBy
        if (RequestContext.currentUser()) {
            await execute()
        } else if (createdBy) {
            const context = captureRequestContext({
                user: createdBy,
                tenantId: task.tenantId,
                organizationId: task.organizationId,
                language: createdBy.preferredLanguage
            })
            await runWithCapturedRequestContext(context, execute)
        } else {
            throw new BadRequestException('Missing createdBy context for auto task execution')
        }

        const now = new Date()
        task.lastRunAt = now
        task.nextRunAt = this.computeAutoTaskNextRunAt(task)
        if (task.frequency === 'once') {
            task.enabled = false
            task.nextRunAt = null
        }
        await this.autoTaskRepository.save(task)
    }

    private computeAutoTaskNextRunAt(task: AutoTask): Date | null {
        const now = new Date()
        if (task.frequency === 'once') {
            if (!task.runAt) {
                return null
            }
            return task.runAt > now ? task.runAt : null
        }

        const parts = task.schedule.trim().split(/\s+/)
        const minute = Number(parts[0])
        const hour = Number(parts[1])
        const safeMinute = Number.isFinite(minute) ? Math.max(0, Math.min(59, minute)) : 0
        const safeHour = Number.isFinite(hour) ? Math.max(0, Math.min(23, hour)) : 9
        const timeZone = this.resolveAutoTaskTimeZone(task.timeZone)

        if (task.frequency === 'daily') {
            let next = this.createAutoTaskZonedDate(now, timeZone, safeHour, safeMinute)
            if (next <= now) {
                next = this.createAutoTaskZonedDate(
                    this.addAutoTaskDaysInTimeZone(now, timeZone, 1),
                    timeZone,
                    safeHour,
                    safeMinute
                )
            }
            return next
        }

        const weekly = Number(parts[4])
        const targetWeekday = Number.isFinite(weekly) ? Math.max(0, Math.min(6, weekly)) : 1
        let next = this.createAutoTaskZonedDate(now, timeZone, safeHour, safeMinute)
        const currentWeekday = this.toAutoTaskZonedDate(now, timeZone).getUTCDay()
        const delta = (targetWeekday - currentWeekday + 7) % 7
        if (delta > 0) {
            next = this.createAutoTaskZonedDate(
                this.addAutoTaskDaysInTimeZone(now, timeZone, delta),
                timeZone,
                safeHour,
                safeMinute
            )
        }
        if (next <= now) {
            next = this.createAutoTaskZonedDate(
                this.addAutoTaskDaysInTimeZone(now, timeZone, 7),
                timeZone,
                safeHour,
                safeMinute
            )
        }
        return next
    }

    private requireAutoTaskAssistantId(params: Record<string, unknown> | null | undefined): string {
        const assistantId = this.resolveAutoTaskAssistantId(params)
        if (!assistantId) {
            throw new BadRequestException('assistantId is required')
        }
        return assistantId
    }

    private resolveAutoTaskAssistantId(params: Record<string, unknown> | null | undefined): string | null {
        const fromAssistant = typeof params?.assistantId === 'string' ? params.assistantId.trim() : ''
        if (fromAssistant) {
            return fromAssistant
        }
        const fromXpert = typeof params?.xpertId === 'string' ? params.xpertId.trim() : ''
        return fromXpert || null
    }

    private resolveAutoTaskTimeZone(value?: string | null): string {
        const normalized = this.normalizeOptionalText(value)
        if (!normalized) {
            return 'UTC'
        }
        try {
            Intl.DateTimeFormat('en-US', { timeZone: normalized }).format(new Date())
            return normalized
        } catch {
            return 'UTC'
        }
    }

    private createAutoTaskZonedDate(base: Date, timeZone: string, hour: number, minute: number): Date {
        const zoned = this.toAutoTaskZonedDate(base, timeZone)
        const candidate = new Date(
            Date.UTC(zoned.getUTCFullYear(), zoned.getUTCMonth(), zoned.getUTCDate(), hour, minute, 0, 0)
        )
        return this.autoTaskZonedTimeToUtc(candidate, timeZone)
    }

    private addAutoTaskDaysInTimeZone(base: Date, timeZone: string, days: number): Date {
        const zoned = this.toAutoTaskZonedDate(base, timeZone)
        const next = new Date(
            Date.UTC(
                zoned.getUTCFullYear(),
                zoned.getUTCMonth(),
                zoned.getUTCDate() + days,
                zoned.getUTCHours(),
                zoned.getUTCMinutes(),
                zoned.getUTCSeconds(),
                zoned.getUTCMilliseconds()
            )
        )
        return this.autoTaskZonedTimeToUtc(next, timeZone)
    }

    private toAutoTaskZonedDate(value: Date, timeZone: string): Date {
        const offset = this.getAutoTaskTimeZoneOffset(value, timeZone)
        return new Date(value.getTime() + offset)
    }

    private autoTaskZonedTimeToUtc(value: Date, timeZone: string): Date {
        const utcGuess = new Date(
            Date.UTC(
                value.getUTCFullYear(),
                value.getUTCMonth(),
                value.getUTCDate(),
                value.getUTCHours(),
                value.getUTCMinutes(),
                value.getUTCSeconds(),
                value.getUTCMilliseconds()
            )
        )
        const offset = this.getAutoTaskTimeZoneOffset(utcGuess, timeZone)
        return new Date(utcGuess.getTime() - offset)
    }

    private getAutoTaskTimeZoneOffset(value: Date, timeZone: string): number {
        const formatter = new Intl.DateTimeFormat('en-US', {
            timeZone,
            hour12: false,
            hourCycle: 'h23',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        })
        const parts = formatter.formatToParts(value)
        const data = parts.reduce<Record<string, number>>((acc, part) => {
            if (part.type !== 'literal') {
                acc[part.type] = Number(part.value)
            }
            return acc
        }, {})
        const normalizedHour = data.hour === 24 ? 0 : (data.hour ?? 0)
        const utcMillis = Date.UTC(
            data.year,
            (data.month ?? 1) - 1,
            data.day ?? 1,
            normalizedHour,
            data.minute ?? 0,
            data.second ?? 0
        )
        return utcMillis - value.getTime()
    }

    private async resolveAutoTaskTemplateId(templateId: string | null | undefined): Promise<string | null> {
        const normalizedTemplateId = this.normalizeOptionalText(templateId)
        if (!normalizedTemplateId) {
            return null
        }
        const { tenantId, organizationId, userId } = this.resolveScheduleScope()
        const template = await this.autoTaskTemplateRepository
            .createQueryBuilder('template')
            .where('(template.id = :templateId or template.key = :templateKey)', {
                templateId: normalizedTemplateId,
                templateKey: normalizedTemplateId
            })
            .andWhere(
                '(template.builtin = true or (template.tenantId = :tenantId and template.organizationId = :organizationId and template.createdById = :createdById))',
                { tenantId, organizationId, createdById: userId }
            )
            .getOne()
        if (!template) {
            throw new BadRequestException('Auto task template not found')
        }
        return template.id
    }

    private normalizeAutoTaskFrequency(value?: string): 'once' | 'daily' | 'weekly' {
        const normalized = (value || 'daily').trim().toLowerCase()
        if (normalized === 'once' || normalized === 'daily' || normalized === 'weekly') {
            return normalized
        }
        throw new BadRequestException('frequency must be one of once/daily/weekly')
    }

    private requireText(value: string | undefined, field: string): string {
        const normalized = typeof value === 'string' ? value.trim() : ''
        if (!normalized) {
            throw new BadRequestException(`${field} is required`)
        }
        return normalized
    }

    private normalizeTemplateKey(value: string): string {
        const normalized = value
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
        if (!normalized) {
            throw new BadRequestException('Template key is required')
        }
        return normalized
    }

    private normalizeTemplateSource(value?: string | null): string | null {
        const normalized = this.normalizeOptionalText(value)
        if (!normalized) {
            return null
        }
        if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(normalized)) {
            throw new BadRequestException('Template source is invalid')
        }
        return normalized
    }

    private normalizeTaskTemplatePrompt(value: string | I18nObject | undefined): string | I18nObject {
        if (typeof value === 'string') {
            return this.requireText(value, 'prompt')
        }
        if (typeof value !== 'object' || Array.isArray(value)) {
            throw new BadRequestException('prompt is required')
        }

        const normalized: Record<string, string> = {}
        for (const [locale, prompt] of Object.entries(value)) {
            const localeKey = this.normalizeOptionalText(locale)
            if (!localeKey || !/^[a-zA-Z]{2,3}([_-][a-zA-Z0-9]{2,8})*$/.test(localeKey)) {
                throw new BadRequestException('prompt locale is invalid')
            }
            const promptText = typeof prompt === 'string' ? prompt.trim() : ''
            if (promptText) {
                normalized[localeKey.replace(/-/g, '_')] = promptText
            }
        }

        if (Object.keys(normalized).length === 0) {
            throw new BadRequestException('prompt is required')
        }

        const defaultPrompt = normalized.en_US
        if (!defaultPrompt) {
            throw new BadRequestException('prompt.en_US is required')
        }

        return { ...normalized, en_US: defaultPrompt }
    }

    private normalizeTaskTemplateOptions(value: TScheduleOptions | null | undefined): TScheduleOptions | null {
        if (!value) {
            return null
        }
        if (typeof value !== 'object' || Array.isArray(value)) {
            throw new BadRequestException('defaultOptions must be an object')
        }
        if (!Object.values(TaskFrequency).includes(value.frequency)) {
            throw new BadRequestException('defaultOptions.frequency is invalid')
        }
        const time = typeof value.time === 'string' ? value.time.trim() : ''
        if (!/^\d{2}:\d{2}$/.test(time)) {
            throw new BadRequestException('defaultOptions.time must use HH:mm format')
        }
        const [hourText, minuteText] = time.split(':')
        const hour = Number(hourText)
        const minute = Number(minuteText)
        if (
            !Number.isInteger(hour) ||
            !Number.isInteger(minute) ||
            hour < 0 ||
            hour > 23 ||
            minute < 0 ||
            minute > 59
        ) {
            throw new BadRequestException('defaultOptions.time is invalid')
        }

        return {
            frequency: value.frequency,
            time,
            ...(value.dayOfWeek !== undefined ? { dayOfWeek: value.dayOfWeek } : {}),
            ...(value.dayOfMonth !== undefined ? { dayOfMonth: value.dayOfMonth } : {}),
            ...(value.month !== undefined ? { month: value.month } : {}),
            ...(value.date ? { date: value.date } : {})
        }
    }

    private async seedBuiltinAutoTaskTemplates() {
        const templates = [
            {
                key: 'standup-summary',
                title: 'Standup summary',
                description: 'Summarize yesterday’s git activity for standup.',
                prompt: 'Summarize yesterday’s git activity for standup. Grounding rules: Anchor statements to commits/PRs/files; do not speculate about intent or future work. Keep it scannable and team-ready.',
                icon: 'clipboard',
                defaultParams: {
                    frequency: 'daily',
                    schedule: '0 9 * * *',
                    time: '09:00',
                    branch: 'main'
                }
            },
            {
                key: 'weekly-risk-review',
                title: 'Weekly risk review',
                description: 'Detect risky code changes and unresolved review findings.',
                prompt: 'Review the latest week of commits and PRs. List top risks, unresolved findings, flaky areas, and concrete next actions.',
                icon: 'warning',
                defaultParams: {
                    frequency: 'weekly',
                    schedule: '0 10 * * 1',
                    time: '10:00',
                    weekday: 1,
                    branch: 'main'
                }
            },
            {
                key: 'weekly-pr-summary',
                title: 'Weekly PR summary',
                description: 'Summarize merged, open, and blocked pull requests for the week.',
                prompt: "Summarize this week's pull requests. Highlight merged work, blocked reviews, and PRs that need follow-up.",
                icon: 'git-pull-request',
                defaultParams: {
                    frequency: 'weekly',
                    schedule: '0 10 * * 1',
                    time: '10:00',
                    weekday: 1,
                    branch: 'main'
                }
            },
            {
                key: 'weekly-org-update',
                title: 'Weekly engineering update',
                description: "Synthesize this week's PRs, rollouts, incidents, and reviews into an engineering update.",
                prompt: "Synthesize this week's PRs, rollouts, incidents, and reviews into a weekly update. Group updates by theme and include only evidence-backed facts and links.",
                icon: 'newspaper',
                defaultParams: {
                    frequency: 'weekly',
                    schedule: '0 10 * * 1',
                    time: '10:00',
                    weekday: 1,
                    branch: 'main'
                }
            },
            {
                key: 'release-notes-draft',
                title: 'Release notes draft',
                description: 'Draft release notes from recent code and PR activity.',
                prompt: 'Draft release notes for the latest shipped changes. Organize by user-facing impact, fixes, and notable risks.',
                icon: 'notebook',
                defaultParams: {
                    frequency: 'weekly',
                    schedule: '0 11 * * 5',
                    time: '11:00',
                    weekday: 5,
                    branch: 'main'
                }
            },
            {
                key: 'pre-tag-checklist',
                title: 'Pre-tag checklist',
                description: 'Prepare the final release readiness checklist before tagging.',
                prompt: 'Prepare a pre-tag checklist covering open blockers, test signal, release notes readiness, and deployment concerns.',
                icon: 'check-square',
                defaultParams: {
                    frequency: 'weekly',
                    schedule: '0 15 * * 4',
                    time: '15:00',
                    weekday: 4,
                    branch: 'main'
                }
            },
            {
                key: 'changelog-update',
                title: 'Changelog update',
                description: 'Draft a changelog entry from the latest merged work.',
                prompt: 'Draft a changelog update from recent merged changes. Group items into added, changed, fixed, and internal notes.',
                icon: 'scroll-text',
                defaultParams: {
                    frequency: 'weekly',
                    schedule: '0 16 * * 5',
                    time: '16:00',
                    weekday: 5,
                    branch: 'main'
                }
            },
            {
                key: 'flaky-ci-summary',
                title: 'Flaky CI summary',
                description: 'Find recent flaky pipelines and recurring test failures.',
                prompt: 'Review recent CI results, identify flaky failures, cluster the repeats, and suggest the most useful next debugging moves.',
                icon: 'activity',
                defaultParams: {
                    frequency: 'daily',
                    schedule: '30 9 * * *',
                    time: '09:30',
                    branch: 'main'
                }
            },
            {
                key: 'issue-triage',
                title: 'Issue triage',
                description: 'Summarize new issues and propose the best next action for each.',
                prompt: 'Review newly opened issues, group duplicates or related reports, and propose a practical next action for each cluster.',
                icon: 'inbox',
                defaultParams: {
                    frequency: 'daily',
                    schedule: '0 13 * * *',
                    time: '13:00',
                    branch: 'main'
                }
            },
            {
                key: 'ci-root-cause-grouping',
                title: 'CI root-cause grouping',
                description: 'Group CI failures by likely root cause and suggest minimal fixes.',
                prompt: 'Check CI failures, group them by likely root cause, and suggest minimal fixes. Include evidence for each root cause guess and prefer low-risk fixes first.',
                icon: 'siren',
                defaultParams: {
                    frequency: 'daily',
                    schedule: '0 11 * * *',
                    time: '11:00',
                    branch: 'main'
                }
            },
            {
                key: 'recent-bug-scan',
                title: 'Recent bug scan',
                description: 'Inspect recent changes for likely regressions or risky edges.',
                prompt: 'Inspect recent changes for likely regressions, fragile paths, and missing test coverage. Call out the riskiest areas first.',
                icon: 'bug',
                defaultParams: {
                    frequency: 'daily',
                    schedule: '0 14 * * *',
                    time: '14:00',
                    branch: 'main'
                }
            },
            {
                key: 'untested-path-detection',
                title: 'Untested path detection',
                description: 'Identify untested paths from recent changes and suggest focused tests.',
                prompt: 'Identify untested paths from recent changes and suggest focused tests. Focus on high-risk paths first and keep additions minimal and targeted.',
                icon: 'test-tube',
                defaultParams: {
                    frequency: 'daily',
                    schedule: '0 15 * * *',
                    time: '15:00',
                    branch: 'main'
                }
            },
            {
                key: 'regression-early-warning',
                title: 'Regression early warning',
                description: 'Compare recent changes to benchmarks or traces and flag regressions early.',
                prompt: 'Compare recent changes to benchmarks or traces and flag regressions early. Quantify deltas where possible and highlight confidence level and potential false positives.',
                icon: 'gauge',
                defaultParams: {
                    frequency: 'daily',
                    schedule: '0 16 * * *',
                    time: '16:00',
                    branch: 'main'
                }
            },
            {
                key: 'dependency-sdk-drift',
                title: 'Dependency/SDK drift detection',
                description: 'Detect dependency and SDK drift and propose a minimal alignment plan.',
                prompt: 'Detect dependency and SDK drift and propose a minimal alignment plan. Group findings by package family and mark safe patch, minor, and major upgrade paths.',
                icon: 'package-search',
                defaultParams: {
                    frequency: 'weekly',
                    schedule: '0 9 * * 2',
                    time: '09:00',
                    weekday: 2,
                    branch: 'main'
                }
            },
            {
                key: 'outdated-dependency-scan',
                title: 'Outdated dependency scan',
                description: 'Find stale dependencies and note the likely upgrade impact.',
                prompt: 'Scan dependencies for stale versions, flag the ones with meaningful security or compatibility impact, and suggest a cautious upgrade order.',
                icon: 'package',
                defaultParams: {
                    frequency: 'weekly',
                    schedule: '0 10 * * 2',
                    time: '10:00',
                    weekday: 2,
                    branch: 'main'
                }
            },
            {
                key: 'agents-doc-update',
                title: 'Agents doc update',
                description: 'Review repo guidance files and suggest stale sections to refresh.',
                prompt: 'Review AGENTS, docs, and workflow guidance files for stale instructions. Summarize what should be refreshed and why.',
                icon: 'book-open',
                defaultParams: {
                    frequency: 'weekly',
                    schedule: '0 11 * * 3',
                    time: '11:00',
                    weekday: 3,
                    branch: 'main'
                }
            },
            {
                key: 'next-skill-recommendation',
                title: 'Next skills to deepen',
                description: 'Suggest the next skills worth deepening from recent PRs and reviews.',
                prompt: 'From recent PRs and reviews, suggest the next skills to deepen. Tie each recommendation to concrete examples and rank by expected impact and learning cost.',
                icon: 'sparkles',
                defaultParams: {
                    frequency: 'weekly',
                    schedule: '0 14 * * 3',
                    time: '14:00',
                    weekday: 3,
                    branch: 'main'
                }
            },
            {
                key: 'performance-leverage-audit',
                title: 'Performance leverage audit',
                description: 'Audit performance regressions and propose the highest-leverage fixes.',
                prompt: 'Audit performance regressions and propose the highest-leverage fixes. Prefer fixes with measurable impact and low rollout risk, and include verification steps.',
                icon: 'zap',
                defaultParams: {
                    frequency: 'weekly',
                    schedule: '0 15 * * 3',
                    time: '15:00',
                    weekday: 3,
                    branch: 'main'
                }
            }
        ]

        for (const item of templates) {
            const exists = await this.autoTaskTemplateRepository.findOne({ where: { key: item.key, builtin: true } })
            if (exists) {
                continue
            }
            const entity = this.autoTaskTemplateRepository.create({
                tenantId: '00000000-0000-0000-0000-000000000000',
                organizationId: '00000000-0000-0000-0000-000000000000',
                createdById: null,
                ...item,
                builtin: true
            })
            await this.autoTaskTemplateRepository.save(entity)
        }
    }
}

async function discoverScheduleStateSchemaFromGraph(
    graph: TXpertGraph,
    agentKey: string,
    agentMiddlewareRegistry: AgentMiddlewareRegistry,
    xpertId: string
): Promise<JsonSchemaObjectType | null> {
    const schemas: JsonSchemaObjectType[] = []

    for (const node of getAgentMiddlewareNodes(graph, agentKey)) {
        const entity = node.entity
        if (!isMiddlewareEntity(entity)) {
            continue
        }

        try {
            const strategy = agentMiddlewareRegistry.get(entity.provider)
            const middleware = await Promise.resolve(
                strategy.createMiddleware(entity.options ?? {}, {
                    tenantId: RequestContext.currentTenantId(),
                    organizationId: RequestContext.getOrganizationId(),
                    userId: RequestContext.currentUserId(),
                    xpertId,
                    node: {
                        ...node,
                        key: node.key,
                        options: entity.options ?? {}
                    },
                    tools: new Map(),
                    runtime: {}
                } as any)
            )
            const schema = pickScheduleTaskPropertiesSchema(
                mergeStateSchemas(
                    normalizeJsonSchema(middleware.stateSchema),
                    normalizeJsonSchema(middleware.stateFormSchema)
                )
            )
            if (schema) {
                schemas.push(schema)
            }
        } catch {
            continue
        }
    }

    return mergeStateSchemas(...schemas)
}

const XPERT_TASK_MUTATION_KEYS = [
    'name',
    'schedule',
    'options',
    'timeZone',
    'prompt',
    'status',
    'runtimeState',
    'xpertId',
    'agentKey'
] satisfies (keyof IXpertTask)[]

type XpertTaskMutation = Partial<Pick<IXpertTask, (typeof XPERT_TASK_MUTATION_KEYS)[number]>>

function sanitizeTaskMutationInput(entity: Partial<IXpertTask>): XpertTaskMutation {
    return {
        ...(Object.prototype.hasOwnProperty.call(entity, 'name') ? { name: entity.name } : {}),
        ...(Object.prototype.hasOwnProperty.call(entity, 'schedule') ? { schedule: entity.schedule } : {}),
        ...(Object.prototype.hasOwnProperty.call(entity, 'options') ? { options: entity.options } : {}),
        ...(Object.prototype.hasOwnProperty.call(entity, 'timeZone') ? { timeZone: entity.timeZone } : {}),
        ...(Object.prototype.hasOwnProperty.call(entity, 'prompt') ? { prompt: entity.prompt } : {}),
        ...(Object.prototype.hasOwnProperty.call(entity, 'status') ? { status: entity.status } : {}),
        ...(Object.prototype.hasOwnProperty.call(entity, 'runtimeState') ? { runtimeState: entity.runtimeState } : {}),
        ...(Object.prototype.hasOwnProperty.call(entity, 'xpertId') ? { xpertId: entity.xpertId } : {}),
        ...(Object.prototype.hasOwnProperty.call(entity, 'agentKey') ? { agentKey: entity.agentKey } : {})
    }
}

function getTaskConnectorBindingIds(runtimeState: TXpertChatState | null | undefined): string[] {
    return getRuntimeConnectorBindingIds(runtimeState?.[STATE_VARIABLE_HUMAN]?.runtimeCapabilities)
}

function symmetricStringDifference(left: string[], right: string[]): string[] {
    const leftSet = new Set(left)
    const rightSet = new Set(right)
    return [...new Set([...left, ...right])].filter((value) => leftSet.has(value) !== rightSet.has(value))
}

function runtimeStateWithoutConnectorSelection(
    runtimeState: TXpertChatState | null | undefined
): TXpertChatState | null | undefined {
    const human = runtimeState?.[STATE_VARIABLE_HUMAN]
    const runtimeCapabilities = human?.runtimeCapabilities
    if (!runtimeState || !human || !runtimeCapabilities) return runtimeState

    const remainingCapabilities: RuntimeCapabilitiesSelectionWithConnectors = { ...runtimeCapabilities }
    delete remainingCapabilities.connectors
    const remainingHuman = { ...human }
    delete remainingHuman.runtimeCapabilities
    if (isConnectorOnlyInheritanceShell(remainingCapabilities)) {
        return {
            ...runtimeState,
            [STATE_VARIABLE_HUMAN]: remainingHuman
        }
    }
    return {
        ...runtimeState,
        [STATE_VARIABLE_HUMAN]: {
            ...human,
            runtimeCapabilities: remainingCapabilities
        }
    }
}

type RuntimeCapabilitiesSelectionWithConnectors = NonNullable<
    NonNullable<TXpertChatState[typeof STATE_VARIABLE_HUMAN]>['runtimeCapabilities']
> & {
    inheritUnselected?: boolean
    connectors?: { bindingIds: string[] }
}

function isConnectorOnlyInheritanceShell(
    capabilities: Omit<RuntimeCapabilitiesSelectionWithConnectors, 'connectors'>
): boolean {
    if (capabilities.mode !== 'allowlist' || capabilities.inheritUnselected !== true) return false
    if (
        Object.keys(capabilities).some(
            (key) => !['mode', 'inheritUnselected', 'skills', 'plugins', 'subAgents'].includes(key)
        )
    ) {
        return false
    }

    const skills = capabilities.skills
    if (!skills || skills.ids.length > 0 || Object.keys(skills).some((key) => key !== 'ids')) {
        return false
    }
    const plugins = capabilities.plugins
    if (!plugins || plugins.nodeKeys.length > 0 || Object.keys(plugins).some((key) => key !== 'nodeKeys')) {
        return false
    }
    const subAgents = capabilities.subAgents
    return !subAgents || (subAgents.nodeKeys.length === 0 && Object.keys(subAgents).every((key) => key === 'nodeKeys'))
}

export function buildProjectTaskRunAsConfigurationHash(task: Pick<IXpertTask, 'xpertId' | 'runtimeState'>): string {
    return createHash('sha256')
        .update(
            JSON.stringify({
                xpertId: task.xpertId?.trim() ?? '',
                connectorBindingIds: getTaskConnectorBindingIds(task.runtimeState).sort()
            })
        )
        .digest('hex')
}

function isMiddlewareEntity(value: unknown): value is IWFNMiddleware {
    return (
        isObject(value) &&
        Reflect.get(value, 'type') === WorkflowNodeTypeEnum.MIDDLEWARE &&
        typeof Reflect.get(value, 'provider') === 'string'
    )
}

function normalizeJsonSchema(schema: unknown): JsonSchemaObjectType | null {
    if (!schema) {
        return null
    }
    try {
        const jsonSchema = (schema as any)?._def ? ToolSchemaParser.parseZodToJsonSchema(schema as any) : schema
        if (!isObject(jsonSchema) || Reflect.get(jsonSchema, 'type') !== 'object') {
            return null
        }
        return applyScheduleStateSchemaTitles(jsonSchema as JsonSchemaObjectType)
    } catch {
        return null
    }
}

function pickScheduleTaskPropertiesSchema(schema: JsonSchemaObjectType | null): JsonSchemaObjectType | null {
    const properties: JsonSchemaObjectType['properties'] = {}

    for (const [key, property] of Object.entries(schema?.properties ?? {})) {
        if (key.startsWith(XPERT_TASK_SCHEDULE_PROPERTY_PREFIX)) {
            properties[key] = property
        }
    }

    const required = (schema?.required ?? []).filter((key) => Object.prototype.hasOwnProperty.call(properties, key))

    return Object.keys(properties).length
        ? {
              type: 'object',
              properties,
              ...(required.length ? { required } : {})
          }
        : null
}

function mergeStateSchemas(...schemas: Array<JsonSchemaObjectType | null | undefined>): JsonSchemaObjectType | null {
    const properties: JsonSchemaObjectType['properties'] = {}
    const required = new Set<string>()

    for (const schema of schemas) {
        if (!schema?.properties) {
            continue
        }
        for (const [key, property] of Object.entries(schema.properties)) {
            properties[key] = mergeJsonSchemaValue(
                properties[key],
                property
            ) as JsonSchemaObjectType['properties'][string]
        }
        for (const key of schema.required ?? []) {
            required.add(key)
        }
    }

    return Object.keys(properties).length
        ? {
              type: 'object',
              properties,
              ...(required.size ? { required: Array.from(required) } : {})
          }
        : null
}

function mergeJsonSchemaValue(base: unknown, override: unknown): unknown {
    if (!isObject(base) || !isObject(override)) {
        return override ?? base
    }

    const result: Record<string, unknown> = { ...(base as Record<string, unknown>) }
    for (const [key, value] of Object.entries(override as Record<string, unknown>)) {
        const existing = result[key]
        result[key] = isObject(existing) && isObject(value) ? mergeJsonSchemaValue(existing, value) : value
    }

    return result
}

function applyScheduleStateSchemaTitles(schema: JsonSchemaObjectType): JsonSchemaObjectType {
    const clone = JSON.parse(JSON.stringify(schema)) as JsonSchemaObjectType
    applyJsonSchemaDescriptionTitles(clone)
    return clone
}

function applyJsonSchemaDescriptionTitles(schema: unknown) {
    if (!isObject(schema)) {
        return
    }

    if (!Reflect.get(schema, 'title') && Reflect.get(schema, 'description')) {
        Reflect.set(schema, 'title', Reflect.get(schema, 'description'))
    }

    const properties = Reflect.get(schema, 'properties')
    if (isObject(properties)) {
        for (const property of Object.values(properties as Record<string, unknown>)) {
            applyJsonSchemaDescriptionTitles(property)
        }
    }

    applyJsonSchemaDescriptionTitles(Reflect.get(schema, 'items'))
}

function mergeRequiredTaskWhere(
    where: FindManyOptions<XpertTask>['where'],
    requiredWhere: FindOptionsWhere<XpertTask>
): FindManyOptions<XpertTask>['where'] {
    if (Array.isArray(where)) {
        return where.map((condition) => ({ ...condition, ...requiredWhere }))
    }
    return { ...(where ?? {}), ...requiredWhere }
}

export function buildScheduleOccurrenceKey(task: IXpertTask, scheduledAt = new Date()) {
    const fireWindow = scheduledAt.toISOString().slice(0, 16)
    return `xpert-task:${task.id}:${fireWindow}`
}

function buildScheduleIdempotencyKey(task: IXpertTask, scheduledAt = new Date()) {
    return buildScheduleOccurrenceKey(task, scheduledAt)
}

export function resolveScheduledOccurrence(task: IXpertTask, reference = new Date()) {
    const timeZone = task.timeZone || 'UTC'
    const cronTime = new CronTime(generateCronExpression(task.options), timeZone)
    const lookbackDays =
        task.options.frequency === TaskFrequency.Daily
            ? 3
            : task.options.frequency === TaskFrequency.Weekly
              ? 14
              : task.options.frequency === TaskFrequency.Monthly
                ? 62
                : 750
    let cursor = new Date(reference.getTime() - lookbackDays * 24 * 60 * 60 * 1000)
    let latest: Date | undefined

    for (let attempt = 0; attempt < 8; attempt += 1) {
        const candidate = cronTime.getNextDateFrom(cursor, timeZone).toJSDate()
        if (candidate > reference) {
            break
        }
        latest = candidate
        cursor = candidate
    }

    return latest ?? reference
}

function normalizeOptionalString(value: unknown) {
    return typeof value === 'string' ? value.trim() : ''
}

function isObject(value: unknown): value is object {
    return !!value && typeof value === 'object' && !Array.isArray(value)
}
