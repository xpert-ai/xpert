import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
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

const createSchedulerSchema = z.object({
    name: z.string().trim().min(1).max(100).describe('scheduler name'),
    schedule: z.string().optional().describe('Cron for an independent scheduled run'),
    mode: z
        .enum(['independent', 'current_conversation', 'existing_conversation', 'new_chat'])
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

const listSchedulerSchema = z.object({
    xpertId: z.string().optional().describe('xpert id used when runtime context does not provide one')
})

const deleteSchedulerSchema = z.object({
    name: z.string().trim().min(1).describe('Exact scheduler name'),
    taskId: z.string().uuid().optional().describe('Task ID when names coincide')
})

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
        private readonly targets: MonitorTargets
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
        return {
            name: SCHEDULER_MIDDLEWARE_PROVIDER,
            tools: [
                this.createSchedulerTool(context),
                this.listSchedulerTool(context),
                this.deleteSchedulerTool(context),
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

    private createSchedulerTool(context: IAgentMiddlewareContext) {
        return tool(
            async (parameters, config) => {
                if (!parameters.name) {
                    throw new ToolParameterValidationError('name is empty')
                }

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
                    'Arrange a future check when work needs follow-up. For new-difference notifications, use current_conversation, existing_conversation or new_chat according to where each check should run. Use independent for a standalone cron task.',
                schema: createSchedulerSchema
            }
        )
    }

    private listSchedulerTool(context: IAgentMiddlewareContext) {
        return tool(
            async (parameters, config) => {
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
                description: 'A tool for listing schedulers',
                schema: listSchedulerSchema
            }
        )
    }

    private deleteSchedulerTool(context: IAgentMiddlewareContext) {
        return tool(
            async (parameters) => {
                return this.commandBus.execute(
                    new DeleteXpertTaskCommand(parameters.name, context.xpertId, context.projectId, parameters.taskId)
                )
            },
            {
                name: SchedulerToolEnum.DELETE_SCHEDULER,
                description: 'A tool for deleting a scheduler',
                schema: deleteSchedulerSchema
            }
        )
    }
}
