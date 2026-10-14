import { BadRequestException } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { TemplateActivity, TChatConversationStatus } from '@xpert-ai/contracts'
import { DataSource, In, IsNull } from 'typeorm'
import { t } from 'i18next'
import { PublishedXpertAccessService } from '../../xpert/published-xpert-access.service'
import { AssistantUserPreferenceService } from '../../xpert/assistant-user-preference.service'
import { ChatConversation } from '../../chat-conversation/conversation.entity'
import { XpertTask } from '../xpert-task.entity'
import { ScheduledTaskExecution } from '../scheduled-task-execution.entity'
import { TemplateActivityCommand } from './template-activity.command'

export function routineResultStatus(
    execution: Pick<ScheduledTaskExecution, 'status'>,
    conversation?: TChatConversationStatus
): TemplateActivity['items'][number]['status'] {
    if (conversation === 'interrupted') return 'awaiting_approval'
    if (conversation === 'paused') return 'paused'
    if (conversation === 'error' || execution.status === 'failed') return 'failed'
    if (conversation === 'busy' || conversation === 'pausing') return 'running'
    return execution.status
}

@CommandHandler(TemplateActivityCommand)
export class TemplateActivityHandler implements ICommandHandler<TemplateActivityCommand> {
    constructor(
        private readonly database: DataSource,
        private readonly published: PublishedXpertAccessService,
        private readonly preferences: AssistantUserPreferenceService
    ) {}

    async execute(command: TemplateActivityCommand): Promise<TemplateActivity> {
        const assistant = await this.published.getAccessiblePublishedXpertForCurrentUser(command.assistantId)
        const scope = { tenantId: assistant.tenantId, organizationId: assistant.organizationId ?? IsNull() }
        const tasks = await this.database.getRepository(XpertTask).find({
            where: {
                ...scope,
                xpertId: assistant.id,
                runAsUserId: RequestContext.currentUserId(),
                projectId: IsNull()
            },
            select: ['id', 'name']
        })
        const executions = tasks.length
            ? await this.database.getRepository(ScheduledTaskExecution).find({
                  where: { ...scope, taskId: In(tasks.map((task) => task.id)) },
                  order: { scheduledAt: 'DESC', id: 'DESC' },
                  take: 50
              })
            : []
        const conversationIds = executions.map((run) => run.conversationId).filter((id): id is string => !!id)
        const conversations = conversationIds.length
            ? await this.database.getRepository(ChatConversation).find({
                  where: {
                      ...scope,
                      id: In(conversationIds),
                      xpertId: assistant.id,
                      createdById: RequestContext.currentUserId()
                  },
                  select: ['id', 'status', 'threadId']
              })
            : []
        const previous = await this.preferences.getDomain(assistant.id, 'templateActivity')
        const read = new Set(previous?.read ?? [])
        const items = executions.map((run) => {
            const conversation = conversations.find((item) => item.id === run.conversationId)
            const status = routineResultStatus(run, conversation?.status)
            const key = `${run.id}:${status}`
            return {
                id: run.id,
                key,
                routine: tasks.find((task) => task.id === run.taskId).name,
                status,
                scheduledAt: run.scheduledAt.toISOString(),
                conversationId: conversation?.id,
                threadId: conversation?.threadId,
                unread: !read.has(key) && !['pending', 'running'].includes(status),
                reason:
                    status === 'failed'
                        ? t(
                              run.failureCode === 'LOCAL_RUNTIME_UNAVAILABLE'
                                  ? 'server-ai:Error.TemplateRoutineLocalUnavailable'
                                  : 'server-ai:Error.TemplateRoutineExecutionFailed'
                          )
                        : undefined
            }
        })
        if (command.acknowledgement) {
            const visible = new Set(items.map((item) => item.key))
            if (command.acknowledgement.keys.some((key) => !visible.has(key)))
                throw new BadRequestException(t('server-ai:Error.TemplateActivityChanged'))
            command.acknowledgement.keys.forEach((key) => read.add(key))
            await this.preferences.compareAndSetDomain(assistant.id, 'templateActivity', previous, {
                read: [...read].slice(-200)
            })
            items.forEach((item) => {
                if (read.has(item.key)) item.unread = false
            })
        }
        return { assistantName: assistant.name, items, unread: items.filter((item) => item.unread).length }
    }
}
