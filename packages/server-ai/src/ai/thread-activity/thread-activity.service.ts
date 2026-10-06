// Discovery reads committed facts. Every reconnect receives a complete snapshot;
// no ephemeral notification or client cursor can cause a short run to disappear.
import { Injectable } from '@nestjs/common'
import { DataSource, In, IsNull } from 'typeorm'
import { IChatConversation, parseResourceCardContent, ThreadActivitySnapshot } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { XpertAgentExecution } from '../../xpert-agent-execution/agent-execution.entity'
import { ChatMessage } from '../../chat-message/chat-message.entity'
import { XpertProjectTask } from '../../xpert-project/entities/project-task.entity'
import { XpertProjectTaskExecution } from '../../xpert-project/entities/project-task-execution.entity'
import { AgentInvocationEntity } from '../../agent-invocation/invocation.entity'
import { XpertProjectAccessService } from '../../xpert-project/services/project-access.service'
import { projectTaskCard } from '../../xpert-project/runtime/project-task-card'

@Injectable()
export class ThreadActivityService {
    constructor(
        private readonly dataSource: DataSource,
        private readonly projects: XpertProjectAccessService
    ) {}

    /** Caller re-authorizes the conversation before each read, including a live subscription. */
    async snapshot(conversation: IChatConversation, threadId: string): Promise<ThreadActivitySnapshot> {
        const scope = { tenantId: conversation.tenantId, organizationId: conversation.organizationId ?? IsNull() }
        const runs = await this.dataSource.getRepository(XpertAgentExecution).find({
            where: { ...scope, threadId, parentId: IsNull() },
            select: ['id', 'status', 'updatedAt', 'createdAt'],
            order: { createdAt: 'ASC', id: 'ASC' }
        })
        const revisions = runs.length
            ? await this.dataSource.getRepository(ChatMessage).find({
                  where: {
                      ...scope,
                      conversationId: conversation.id,
                      role: 'ai',
                      executionId: In(runs.map((run) => run.id))
                  },
                  select: ['executionId', 'updatedAt']
              })
            : []
        const result: ThreadActivitySnapshot = {
            version: 1,
            threadId,
            runs: runs.map((run) => ({
                id: run.id,
                status: run.status,
                updatedAt: run.updatedAt.toISOString(),
                createdAt: run.createdAt.toISOString(),
                messageRevision:
                    revisions
                        .filter((message) => message.executionId === run.id)
                        .map((message) => message.updatedAt.toISOString())
                        .sort()
                        .at(-1) ?? ''
            })),
            cards: []
        }
        if (!conversation.projectId || !runs.length) return result
        await this.projects.assertCanRead(conversation.projectId)
        const messages = await this.dataSource
            .getRepository(ChatMessage)
            .createQueryBuilder('message')
            .select(['message.id', 'message.executionId', 'message.content'])
            .where({
                ...scope,
                conversationId: conversation.id,
                role: 'ai',
                executionId: In(runs.map((run) => run.id))
            })
            .andWhere('CAST(message.content AS text) LIKE :card', { card: '%"resource_card"%' })
            .getMany()
        for (const message of messages) {
            if (!Array.isArray(message.content)) continue
            for (const part of message.content) {
                const card = parseResourceCardContent(part)
                if (!card || card.data.resource.namespace !== 'platform.project-tasks') continue
                const where = { ...scope, projectId: conversation.projectId, id: card.data.resource.id }
                if (card.data.resource.type === 'task') {
                    const task = await this.dataSource.getRepository(XpertProjectTask).findOneBy(where)
                    if (!task) continue
                    card.data = {
                        ...projectTaskCard({ type: 'task', id: task.id, title: card.data.title, status: task.status })
                    }
                } else if (card.data.resource.type === 'execution') {
                    const attempt = await this.dataSource.getRepository(XpertProjectTaskExecution).findOneBy({
                        ...where,
                        conversationId: conversation.id,
                        threadId
                    })
                    if (!attempt?.invocationId) continue
                    const record = await this.dataSource.getRepository(AgentInvocationEntity).findOneBy({
                        ...scope,
                        id: attempt.invocationId,
                        ownerId: RequestContext.currentUserId()
                    })
                    const reference = record?.invocation.request.dispatch?.projectTask
                    const invocation =
                        record?.invocation.scope.parentExecutionId === message.executionId &&
                        reference?.taskExecutionId === attempt.id &&
                        reference.projectId === conversation.projectId &&
                        reference.projectTaskId === attempt.taskId
                            ? record.invocation
                            : null
                    card.data = projectTaskCard({
                        type: 'execution',
                        id: attempt.id,
                        title: card.data.title,
                        attempt: attempt.attempt,
                        purpose: attempt.purpose?.type,
                        provider: invocation?.request.target.provider,
                        status: invocation?.status ?? 'restricted'
                    })
                } else continue
                result.cards.push({ ...card, messageId: message.id, executionId: message.executionId })
            }
        }
        return result
    }
}
