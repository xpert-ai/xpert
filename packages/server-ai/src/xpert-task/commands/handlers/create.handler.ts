import { requireMonitorTarget, resolveMonitorDestination } from '../../conversation-monitor'
import { IXpertAgent, RolesEnum, ScheduleTaskStatus } from '@xpert-ai/contracts'
import { calendarOptions } from '../../calendar-options'
import { RequestContext } from '@xpert-ai/server-core'
import { InjectQueue } from '@nestjs/bull'
import { BadRequestException, Logger } from '@nestjs/common'
import { CommandBus, CommandHandler, ICommandHandler, QueryBus } from '@nestjs/cqrs'
import { Queue } from 'bull'
import { CronTime } from 'cron'
import { I18nService } from 'nestjs-i18n'
import { t } from 'i18next'
import { GetXpertWorkflowQuery } from '../../../xpert/queries'
import { XpertTaskService } from '../../xpert-task.service'
import { CreateXpertTaskCommand } from '../create.command'

@CommandHandler(CreateXpertTaskCommand)
export class CreateXpertTaskHandler implements ICommandHandler<CreateXpertTaskCommand> {
    readonly #logger = new Logger(CreateXpertTaskHandler.name)

    constructor(
        private readonly taskService: XpertTaskService,
        private readonly commandBus: CommandBus,
        private readonly queryBus: QueryBus,
        @InjectQueue('xpert-task-scheduler') private scheduler: Queue,
        private readonly i18n: I18nService
    ) {}

    public async execute(command: CreateXpertTaskCommand) {
        const currentUserId = RequestContext.currentUserId()

        if (command.task.runAsUserId && command.task.runAsUserId !== currentUserId) {
            throw new BadRequestException(
                t('server-ai:Error.ProjectTaskRunAsConfirmationRequired', {
                    defaultValue: 'The selected run-as user must confirm this automation before it can be assigned'
                })
            )
        }
        command.task.runAsUserId = currentUserId
        if (command.monitor?.destination) {
            await requireMonitorTarget(this.queryBus, command.task, command.monitor)
            const destination = await resolveMonitorDestination(
                this.queryBus,
                command.task.xpertId,
                command.monitor.destination
            )
            if (destination) command.task.projectId = destination.projectId ?? undefined
        }
        await this.taskService.assertProjectTaskCanBeCreated(command.task)
        const { xpertId, agentKey } = command.task

        // Trial account limit
        if (RequestContext.hasRole(RolesEnum.TRIAL)) {
            const { items } = await this.taskService.findMyAll()
            if (items.length >= 10) {
                throw new Error(`Your user role can only schedule a maximum of 10 tasks`)
            }
        }

        // Check agentKey
        if (xpertId && agentKey) {
            const { agent } = await this.queryBus.execute<GetXpertWorkflowQuery, { agent: IXpertAgent }>(
                new GetXpertWorkflowQuery(xpertId, agentKey, false)
            )
            if (!agent) {
                throw new Error(`Xpert agent not found for xpertId: '${xpertId}' and key '${agentKey}'`)
            }
        }

        if (command.task.monitor) throw new BadRequestException(t('server-ai:Error.ScheduleConversationUnavailable'))
        if (command.monitor) {
            const task = await this.taskService.createConversationMonitor(command.task, command.monitor)
            if (task.status === ScheduleTaskStatus.SCHEDULED) {
                await this.scheduler.add(
                    { taskId: task.id, registerOnly: true },
                    { jobId: task.id, removeOnComplete: true, removeOnFail: true }
                )
            }
            return task
        }
        const request = RequestContext.currentRequest()
        const timeZone = resolveTaskTimeZone(command.task.timeZone, request?.headers?.['time-zone'])
        const schedule = command.task.schedule?.trim()
        let options = command.task.options
        if (!options && schedule) {
            try {
                new CronTime(schedule, timeZone || 'UTC')
            } catch {
                throw new BadRequestException(t('server-ai:ResourceCard.InvalidSchedule'))
            }
            options = calendarOptions(schedule)
        }
        const task = await this.taskService.create({
            ...command.task,
            pendingRunAsUserId: null,
            pendingRunAsRequestedById: null,
            pendingRunAsRequestedAt: null,
            options,
            schedule: options ? null : schedule,
            timeZone,
            status: ScheduleTaskStatus.SCHEDULED
        })

        // Start task not in current context
        await this.scheduler.add({ taskId: task.id })

        return task
    }
}

function resolveTaskTimeZone(taskTimeZone?: string | null, headerTimeZone?: string | string[]): string | undefined {
    const value = taskTimeZone ?? (Array.isArray(headerTimeZone) ? headerTimeZone[0] : headerTimeZone)
    return value?.trim() || undefined
}
