import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { FollowUpTimerSource, setDeadline } from '../../agent-event/follow-up-timer.source'
import { tool } from '@langchain/core/tools'
import {
    ChatMessageEventTypeEnum,
    ChatMessageStepCategory,
    getToolCallIdFromConfig,
    TAgentMiddlewareMeta
} from '@xpert-ai/contracts'
import { omit } from '@xpert-ai/server-common'
import { Injectable, Logger } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import {
    AgentMiddleware,
    AgentMiddlewareStrategy,
    IAgentMiddlewareContext,
    IAgentMiddlewareStrategy,
    emitResourceCard
} from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { nextMonitorCheck } from '../conversation-monitor'
import { MonitorTargets } from '../monitor-targets'
import { CronTime } from 'cron'
import { z } from 'zod/v3'
import { ToolParameterValidationError } from '../../shared/tools/errors'
import { QueryXpertTaskCommand, CreateXpertTaskCommand, DeleteXpertTaskCommand } from '../commands'
import { differenceReport, ScheduleDifferenceReports } from '../schedule-difference-reports'
import { ScheduleTaskIcon, SchedulerToolEnum } from './types'

const SCHEDULER_MIDDLEWARE_PROVIDER = 'scheduler'

const recurringModes = ['independent', 'current_conversation', 'existing_conversation', 'new_chat'] as const
const recurringSchedule = z.object({
    name: z.string().trim().min(1).max(100).describe('scheduler name'),
    schedule: z.string().optional().describe('Cron for an independent scheduled run'),
    mode: z
        .enum(recurringModes)
        .optional()
        .describe(
            'Monitor this thread, a selected existing conversation, or a new chat per run. Difference checks default to every 30 minutes.'
        ),
    intervalMinutes: z
        .number()
        .int()
        .min(1)
        .max(525600)
        .optional()
        .describe('Elapsed minutes between difference checks; default 30'),
    conversationId: z
        .string()
        .uuid()
        .optional()
        .describe('Selected conversation from list_schedule_targets for existing_conversation'),
    threadId: z
        .string()
        .uuid()
        .optional()
        .describe('Selected thread from list_schedule_targets for existing_conversation'),
    timeZone: z.string().optional().describe('IANA time zone'),
    xpertId: z.string().optional().describe('xpert id used when runtime context does not provide one'),
    agentKey: z.string().optional().describe('agent key'),
    prompt: z.string().trim().min(1).max(16000).describe('scheduler prompt')
})

// Model providers expect an object at the root. Validate the selected mode's fields before dispatch.
const followUpMode = z.enum(['follow_up'])
const createSchedulerSchema = recurringSchedule
    .partial({ name: true, prompt: true })
    .extend({
        mode: z
            .enum([...recurringModes, 'follow_up'])
            .optional()
            .describe(
                'Use follow_up for a single deadline in this thread; use a monitor mode for repeated difference checks.'
            ),
        dueAt: setDeadline.shape.dueAt.optional().describe('Follow-up only. Future ISO 8601 deadline with a timezone.'),
        purpose: setDeadline.shape.purpose.optional().describe('Follow-up only. What to check when the agent returns.')
    })
    .strict()

const scheduledTaskList = z.object({
    xpertId: z.string().optional().describe('Assistant ID fallback for scheduled tasks without runtime context.')
})
const listSchedulerSchema = scheduledTaskList
    .extend({
        mode: followUpMode
            .optional()
            .describe('Use follow_up for pending deadlines in this thread. Omit for scheduled tasks.')
    })
    .strict()

const scheduledTaskDeletion = z.object({
    name: z.string().trim().min(1).describe('Exact name of the scheduled task'),
    taskId: z.string().uuid().optional().describe('Task ID when names coincide')
})
const deleteSchedulerSchema = scheduledTaskDeletion
    .partial({ name: true })
    .extend({
        mode: followUpMode.optional().describe('Use follow_up to cancel a pending deadline in this thread.'),
        taskId: scheduledTaskDeletion.shape.taskId.describe(
            'Required for follow_up. For ordinary tasks, disambiguates matching names.'
        )
    })
    .strict()

type ScheduleMiddlewareConfig = Record<string, never>

@Injectable()
@AgentMiddlewareStrategy(SCHEDULER_MIDDLEWARE_PROVIDER)
export class SchedulerAgentMiddleware implements IAgentMiddlewareStrategy<ScheduleMiddlewareConfig> {
    private readonly logger = new Logger(SchedulerAgentMiddleware.name)
    readonly meta: TAgentMiddlewareMeta = {
        features: ['scheduler'],
        name: SCHEDULER_MIDDLEWARE_PROVIDER,
        label: {
            en_US: 'Scheduler',
            zh_Hans: '定时任务'
        },
        description: {
            en_US: 'Create and manage schedulers.',
            zh_Hans: '创建和管理定时任务。'
        },
        icon: {
            type: 'svg',
            value: ScheduleTaskIcon
        },
        configSchema: {
            type: 'object',
            properties: {}
        }
    }

    constructor(
        private readonly commandBus: CommandBus,
        private readonly reports: ScheduleDifferenceReports,
        private readonly targets: MonitorTargets,
        private readonly timers: FollowUpTimerSource
    ) {}

    async createMiddleware(
        _options: ScheduleMiddlewareConfig,
        context: IAgentMiddlewareContext
    ): Promise<AgentMiddleware> {
        const report = await this.reports.bind(context)
        if (report) {
            return {
                name: SCHEDULER_MIDDLEWARE_PROVIDER,
                tools: [
                    tool(report, {
                        name: 'report_schedule_differences',
                        description:
                            'Report the full set of differences observed in this check. Use stable source and field identifiers and exact values. Report an empty array when unchanged.',
                        schema: differenceReport
                    })
                ]
            }
        }
        const inThread = Boolean(context.conversationId && context.threadId)
        return {
            name: SCHEDULER_MIDDLEWARE_PROVIDER,
            tools: [
                this.createSchedulerTool(context, inThread),
                this.listSchedulerTool(context, inThread),
                this.deleteSchedulerTool(context, inThread),
                tool(
                    async ({ search, offset }) =>
                        JSON.stringify(await this.targets.list(context.xpertId, search, offset)),
                    {
                        name: 'list_schedule_targets',
                        description:
                            'Search accessible chats in this Assistant to select an existing conversation for a scheduled check.',
                        schema: z.object({
                            search: z.string().max(200).optional(),
                            offset: z.number().int().nonnegative().optional()
                        })
                    }
                )
            ]
        }
    }

    private createSchedulerTool(context: IAgentMiddlewareContext, inThread: boolean) {
        return tool(
            async (input, config) => {
                if (input.mode === 'follow_up') {
                    const { mode, ...deadline } = input
                    const { timerId, dueAt, state } = await this.timers.set(
                        context,
                        setDeadline.parse(deadline),
                        getToolCallIdFromConfig(config)
                    )
                    return JSON.stringify({ mode, taskId: timerId, dueAt, state })
                }
                const parameters = recurringSchedule.strict().parse(input)

                const monitor = !!parameters.mode && parameters.mode !== 'independent'
                if (parameters.mode === 'existing_conversation' && (!parameters.conversationId || !parameters.threadId))
                    throw new ToolParameterValidationError(t('server-ai:Error.ScheduleConversationUnavailable'))
                const destination =
                    parameters.mode === 'new_chat'
                        ? { type: 'new_chat' as const }
                        : parameters.mode === 'existing_conversation'
                          ? {
                                type: 'conversation' as const,
                                conversationId: parameters.conversationId,
                                threadId: parameters.threadId
                            }
                          : undefined
                if (
                    monitor &&
                    (!context.conversationId ||
                        !context.threadId ||
                        !context.xpertId ||
                        (parameters.schedule &&
                            (parameters.schedule !== '*/30 * * * *' || (parameters.intervalMinutes ?? 30) !== 30)))
                ) {
                    throw new ToolParameterValidationError(t('server-ai:Error.ScheduleConversationUnavailable'))
                }
                if (!monitor) {
                    try {
                        new CronTime(parameters.schedule || '', parameters.timeZone || 'UTC')
                    } catch {
                        throw new ToolParameterValidationError('Invalid schedule (cron expression) format')
                    }
                }

                const task = await this.commandBus.execute(
                    new CreateXpertTaskCommand(
                        {
                            name: parameters.name,
                            prompt: parameters.prompt,
                            schedule: monitor ? undefined : parameters.schedule,
                            timeZone: parameters.timeZone,
                            agentKey: monitor ? context.agentKey : parameters.agentKey,
                            xpertId: context.xpertId ?? parameters.xpertId,
                            projectId: context.projectId
                        },
                        undefined,
                        monitor
                            ? {
                                  source: 'agent',
                                  destination,
                                  intervalMinutes: parameters.intervalMinutes,
                                  conversationId: context.conversationId,
                                  threadId: context.threadId,
                                  requestKey: getToolCallIdFromConfig(config) || parameters.prompt.trim()
                              }
                            : undefined
                    )
                )

                await emitResourceCard(
                    {
                        resource: { namespace: 'platform', type: 'scheduled-task', id: task.id },
                        title: task.name,
                        description: [
                            task.scheduleDescription,
                            task.timeZone || 'UTC',
                            task.status ? t(`server-ai:ResourceCard.Status.${task.status}`) : null
                        ]
                            .filter(Boolean)
                            .join(' · '),
                        icon: { type: 'svg', value: ScheduleTaskIcon },
                        open: { target: 'workbench.view', viewKey: 'platform.scheduler__detail', selectionId: task.id }
                    },
                    config
                ).catch((error: Error) => {
                    this.logger.warn(
                        `Scheduled task ${task.id} was created but its resource card could not be emitted: ${error.message}`
                    )
                })

                return monitor
                    ? JSON.stringify({
                          taskId: task.id,
                          schedule: task.scheduleDescription,
                          timeZone: task.timeZone,
                          nextRunAt:
                              task.schedule && task.monitor
                                  ? nextMonitorCheck(task.monitor, task.schedule, task.timeZone)
                                  : undefined,
                          target: parameters.mode,
                          intervalMinutes: parameters.intervalMinutes ?? 30,
                          notify: 'new-differences'
                      })
                    : 'Scheduler creation completed!'
            },
            {
                name: SchedulerToolEnum.CREATE_SCHEDULER,
                description:
                    'Schedule recurring difference checks with a monitor mode or a standalone cron with independent. Both require name and prompt.' +
                    (inThread
                        ? ' Use mode follow_up with only dueAt and purpose to wake this agent once in the current thread.'
                        : ''),
                schema: inThread ? createSchedulerSchema : recurringSchedule.strict()
            }
        )
    }

    private listSchedulerTool(context: IAgentMiddlewareContext, inThread: boolean) {
        return tool(
            async (parameters, config) => {
                if ('mode' in parameters && parameters.mode === 'follow_up') {
                    if (parameters.xpertId !== undefined)
                        throw new ToolParameterValidationError(
                            'Follow-up lookup uses the current thread. Supply only mode.'
                        )
                    const timers = await this.timers.list(context)
                    return JSON.stringify(
                        timers.map(({ id, dueAt, purpose, state }) => ({
                            mode: 'follow_up',
                            taskId: id,
                            dueAt,
                            purpose,
                            state
                        }))
                    )
                }
                const tasks = await this.commandBus.execute(
                    new QueryXpertTaskCommand(context.xpertId ?? parameters.xpertId, context.projectId ?? null)
                )

                await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
                    id: getToolCallIdFromConfig(config),
                    category: 'Computer',
                    type: ChatMessageStepCategory.WebSearch,
                    toolset: SCHEDULER_MIDDLEWARE_PROVIDER,
                    title: t('server-ai:Tools.Task.ScheduledTask'),
                    data: tasks.map((task) => ({
                        title: task.name,
                        content: task.prompt,
                        url: `/chat/tasks/${task.id}`
                    }))
                }).catch((err) => {
                    console.error(err)
                })

                return JSON.stringify(tasks.map((task) => omit(task, 'job')))
            },
            {
                name: SchedulerToolEnum.LIST_SCHEDULER,
                description:
                    'List scheduled tasks.' +
                    (inThread
                        ? ' Use mode follow_up to find pending deadlines and their taskId in the current thread.'
                        : ''),
                schema: inThread ? listSchedulerSchema : scheduledTaskList.strict()
            }
        )
    }

    private deleteSchedulerTool(context: IAgentMiddlewareContext, inThread: boolean) {
        return tool(
            async (parameters) => {
                if ('mode' in parameters && parameters.mode === 'follow_up') {
                    if (!parameters.taskId || parameters.name !== undefined)
                        throw new ToolParameterValidationError('Cancelling a follow-up requires only mode and taskId.')
                    const { timerId, state } = await this.timers.cancel(context, parameters.taskId)
                    return JSON.stringify({ mode: parameters.mode, taskId: timerId, state })
                }
                if (!parameters.name)
                    throw new ToolParameterValidationError('Deleting a scheduled task requires its exact name.')
                return this.commandBus.execute(
                    new DeleteXpertTaskCommand(parameters.name, context.xpertId, context.projectId, parameters.taskId)
                )
            },
            {
                name: SchedulerToolEnum.DELETE_SCHEDULER,
                description:
                    'Delete a scheduled task by name.' +
                    (inThread
                        ? ' Use mode follow_up and taskId to cancel a pending deadline in the current thread.'
                        : ''),
                schema: inThread ? deleteSchedulerSchema : scheduledTaskDeletion.strict()
            }
        )
    }
}
