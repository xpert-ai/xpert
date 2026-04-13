import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { tool } from '@langchain/core/tools'
import {
    ChatMessageEventTypeEnum,
    ChatMessageStepCategory,
    getToolCallIdFromConfig,
    TAgentMiddlewareMeta
} from '@xpert-ai/contracts'
import { omit } from '@xpert-ai/server-common'
import { Injectable } from '@nestjs/common'
import { CommandBus } from '@nestjs/cqrs'
import {
    AgentMiddleware,
    AgentMiddlewareStrategy,
    IAgentMiddlewareContext,
    IAgentMiddlewareStrategy,
    PromiseOrValue
} from '@xpert-ai/plugin-sdk'
import { t } from 'i18next'
import { z } from 'zod/v3'
import { ToolParameterValidationError } from '../../shared/tools/errors'
import { QueryXpertTaskCommand, CreateXpertTaskCommand, DeleteXpertTaskCommand } from '../commands'
import { ScheduleTaskIcon, SchedulerToolEnum } from './types'

const SCHEDULER_MIDDLEWARE_PROVIDER = 'scheduler'

const cronRegex =
    /(@(annually|yearly|monthly|weekly|daily|hourly|reboot))|(@every (\d+(ns|us|µs|ms|s|m|h))+)|((((\d+,)+\d+|(\d+(\/|-)\d+)|\d+|\*) ?){5,7})/

const createSchedulerSchema = z.object({
    name: z.string().describe('scheduler name'),
    schedule: z.string().describe('cron expression'),
    xpertId: z.string().optional().describe('xpert id used when runtime context does not provide one'),
    agentKey: z.string().optional().describe('agent key'),
    prompt: z.string().describe('scheduler prompt')
})

const listSchedulerSchema = z.object({
    xpertId: z.string().optional().describe('xpert id used when runtime context does not provide one')
})

const deleteSchedulerSchema = z.object({
    name: z.string().optional().describe('scheduler name')
})

type ScheduleMiddlewareConfig = Record<string, never>

@Injectable()
@AgentMiddlewareStrategy(SCHEDULER_MIDDLEWARE_PROVIDER)
export class SchedulerAgentMiddleware implements IAgentMiddlewareStrategy<ScheduleMiddlewareConfig> {
    readonly meta: TAgentMiddlewareMeta = {
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
            value: ScheduleTaskIcon,
        },
        configSchema: {
            type: 'object',
            properties: {}
        }
    }

    constructor(private readonly commandBus: CommandBus) {}

    createMiddleware(
        _options: ScheduleMiddlewareConfig,
        context: IAgentMiddlewareContext
    ): PromiseOrValue<AgentMiddleware> {
        return {
            name: SCHEDULER_MIDDLEWARE_PROVIDER,
            tools: [
                this.createSchedulerTool(context),
                this.listSchedulerTool(context),
                this.deleteSchedulerTool()
            ]
        }
    }

    private createSchedulerTool(context: IAgentMiddlewareContext) {
        return tool(
            async (parameters, config) => {
                if (!parameters.name) {
                    throw new ToolParameterValidationError('name is empty')
                }

                if (!cronRegex.test(parameters.schedule)) {
                    throw new ToolParameterValidationError('Invalid schedule (cron expression) format')
                }

                const task = await this.commandBus.execute(
                    new CreateXpertTaskCommand({
                        ...parameters,
                        xpertId: context.xpertId ?? parameters.xpertId
                    })
                )

                await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, {
                    id: getToolCallIdFromConfig(config),
                    category: 'Computer',
                    type: ChatMessageStepCategory.WebSearch,
                    toolset: SCHEDULER_MIDDLEWARE_PROVIDER,
                    title: t('server-ai:Tools.Task.ScheduledTask'),
                    data: [
                        {
                            title: task.name,
                            content: task.prompt,
                            url: `/chat/tasks/${task.id}`
                        }
                    ]
                }).catch((err) => {
                    console.error(err)
                })

                return 'Scheduler creation completed!'
            },
            {
                name: SchedulerToolEnum.CREATE_SCHEDULER,
                description: 'A tool for creating a scheduler',
                schema: createSchedulerSchema
            }
        )
    }

    private listSchedulerTool(context: IAgentMiddlewareContext) {
        return tool(
            async (parameters, config) => {
                const tasks = await this.commandBus.execute(
                    new QueryXpertTaskCommand(context.xpertId ?? parameters.xpertId)
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

    private deleteSchedulerTool() {
        return tool(
            async (parameters) => {
                return this.commandBus.execute(new DeleteXpertTaskCommand(parameters.name))
            },
            {
                name: SchedulerToolEnum.DELETE_SCHEDULER,
                description: 'A tool for deleting a scheduler',
                schema: deleteSchedulerSchema
            }
        )
    }
}
