import { EntityManager } from 'typeorm'
import { User, UserOrganization } from '@xpert-ai/server-core'
import { UserType } from '@xpert-ai/contracts'
import { ChatConversation } from '../chat-conversation/conversation.entity'
import { enqueueNotification } from '../user-notification/notification.outbox'
import { XpertTask } from './xpert-task.entity'
import { ScheduledTaskExecution } from './scheduled-task-execution.entity'

/** Capture a personal scheduled result in the same transaction as its terminal transition. */
export async function enqueueScheduledTaskCompletion(manager: EntityManager, execution: ScheduledTaskExecution) {
    if (!execution.tenantId || !execution.conversationId) return
    const task = await manager
        .getRepository(XpertTask)
        .findOneBy({ id: execution.taskId, tenantId: execution.tenantId })
    if (!task?.runAsUserId || !task.xpertId || task.projectId) return
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
        createdById: user.id,
        xpertId: task.xpertId
    })
    if (!conversation || conversation.status !== 'idle') return
    await enqueueNotification(manager, execution.tenantId, user.id, `scheduled:${execution.id}:completed`, {
        type: 'agent.completed',
        source: {
            type: 'scheduled_task',
            taskId: task.id,
            executionId: execution.id,
            assistantId: task.xpertId,
            conversationId: conversation.id
        }
    })
}
