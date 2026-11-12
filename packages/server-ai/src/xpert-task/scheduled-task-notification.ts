import { EntityManager, IsNull, Not } from 'typeorm'
import { User, UserOrganization } from '@xpert-ai/server-core'
import { UserType } from '@xpert-ai/contracts'
import { ChatConversation } from '../chat-conversation/conversation.entity'
import { enqueueNotification } from '../user-notification/notification.outbox'
import { t } from 'i18next'
import { XpertTask } from './xpert-task.entity'
import { ScheduledTaskExecution, ScheduledTaskExecutionStatus } from './scheduled-task-execution.entity'

/** Capture a personal scheduled result in the same transaction as its terminal transition. */
export async function enqueueScheduledTaskCompletion(manager: EntityManager, execution: ScheduledTaskExecution) {
    if (!execution.tenantId || !execution.conversationId) return
    const task = await manager
        .getRepository(XpertTask)
        .findOneBy({ id: execution.taskId, tenantId: execution.tenantId })
    if (!task?.runAsUserId || !task.xpertId || (task.projectId && !task.monitor)) return
    if (task.monitor) {
        if (execution.differenceKeys == null) {
            await manager.update(ScheduledTaskExecution, execution.id, {
                status: ScheduledTaskExecutionStatus.FAILED,
                lastError: t('server-ai:Error.ScheduleReportMissing')
            })
            return
        }
        // Serialize observations including empty ones. Resolved differences can become new again.
        await manager
            .getRepository(XpertTask)
            .findOneOrFail({ where: { id: task.id }, lock: { mode: 'pessimistic_write' } })
        if (!execution.differenceKeys.length) return
        const previous = await manager.getRepository(ScheduledTaskExecution).findOne({
            where: { taskId: task.id, id: Not(execution.id), status: ScheduledTaskExecutionStatus.SUCCEEDED },
            order: { scheduledAt: 'DESC', id: 'DESC' },
            select: ['differenceKeys', 'scheduledAt']
        })
        if (previous && previous.scheduledAt > execution.scheduledAt) return
        const seen = new Set(previous?.differenceKeys ?? [])
        if (execution.differenceKeys.every((key) => seen.has(key))) return
    }
    const user = await manager.getRepository(User).findOneBy({ id: task.runAsUserId, tenantId: execution.tenantId })
    if (!user || user.type === UserType.COMMUNICATION) return
    if (
        task.organizationId &&
        !(await manager.getRepository(UserOrganization).existsBy({
            userId: user.id,
            tenantId: execution.tenantId,
            organizationId: task.organizationId,
            isActive: true
        }))
    )
        return
    const conversation = await manager.getRepository(ChatConversation).findOneBy({
        id: execution.conversationId,
        tenantId: execution.tenantId,
        ...(task.monitor ? { projectId: task.projectId || IsNull() } : { createdById: user.id }),
        xpertId: task.xpertId
    })
    if (!conversation || (!task.monitor && conversation.status !== 'idle')) return
    await enqueueNotification(manager, execution.tenantId, user.id, `scheduled:${execution.id}:completed`, {
        type: 'agent.completed',
        source: {
            type: 'scheduled_task',
            taskId: task.id,
            executionId: execution.id,
            assistantId: task.xpertId,
            conversationId: conversation.id,
            ...(task.monitor
                ? { threadId: task.monitor.target === 'new_chat' ? conversation.threadId : task.monitor.threadId }
                : {})
        }
    })
}
