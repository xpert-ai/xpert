// Invariants: all existing-conversation root entry points share the durable thread writer claim.
// A runtime reply may queue, but cannot clear a pause, approve an interaction or reverse a user stop.
import { Injectable } from '@nestjs/common'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { TChatRequest, XpertAgentExecutionStatusEnum } from '@xpert-ai/contracts'
import { DataSource, EntityManager } from 'typeorm'
import { randomUUID } from 'node:crypto'
import { Observable } from 'rxjs'
import { ChatConversation } from './conversation.entity'
import { ChatConversationThread } from './conversation-thread.entity'
import { XpertAgentExecution } from '../xpert-agent-execution/agent-execution.entity'
import { ThreadRunControlService, threadControlConflict } from './thread-run-control.service'

export async function lockRuntimeThread(manager: EntityManager, conversation: ChatConversation, threadId: string) {
    const repo = manager.getRepository(ChatConversationThread)
    if (threadId === conversation.threadId) {
        await repo
            .createQueryBuilder()
            .insert()
            .values({
                threadId,
                conversationId: conversation.id,
                tenantId: conversation.tenantId,
                organizationId: conversation.organizationId,
                createdById: conversation.createdById,
                status: conversation.status ?? 'idle'
            })
            .orIgnore()
            .execute()
    }
    const thread = await repo.findOne({
        where: {
            conversationId: conversation.id,
            threadId,
            tenantId: conversation.tenantId,
            organizationId: conversation.organizationId
        },
        lock: { mode: 'pessimistic_write' }
    })
    if (!thread) throw threadControlConflict('ThreadNotFound', 'Thread not found')
    return thread
}

@Injectable()
export class ChatExecutionAdmissionService {
    constructor(
        private readonly dataSource: DataSource,
        private readonly control: ThreadRunControlService
    ) {}

    async run<T>(
        request: TChatRequest,
        options: {
            automatic?: boolean
            threadId?: string
            execution?: { id: string }
            xpertId?: string
            agentKey?: string
        },
        execute: (executionId?: string) => Promise<Observable<T>>
    ): Promise<Observable<T>> {
        if (!request.conversationId || request.action === 'follow_up' || !RequestContext.currentUserId())
            return execute(options.execution?.id)
        const conversation = await this.dataSource.getRepository(ChatConversation).findOneBy({
            id: request.conversationId,
            tenantId: RequestContext.currentTenantId(),
            organizationId: RequestContext.getOrganizationId(),
            createdById: RequestContext.currentUserId()
        })
        // The handler retains authorization for other established actor types (e.g. end users).
        if (!conversation) return execute(options.execution?.id)
        const threadId = options.threadId ?? conversation.threadId
        const executionId =
            options.execution?.id ??
            (request.action === 'resume' ? request.target.executionId : undefined) ??
            randomUUID()
        await this.dataSource.transaction(async (manager) => {
            const thread = await lockRuntimeThread(manager, conversation, threadId)
            if (
                options.automatic &&
                (thread.runControl?.executionId !== executionId ||
                    thread.runControl.state !== 'running' ||
                    thread.status !== 'busy')
            )
                throw threadControlConflict('RuntimeMessageBlocked', 'Automatic continuation is blocked.')
            if (
                thread.runControl?.executionId !== executionId &&
                (thread.runControl || ['busy', 'pausing', 'paused'].includes(thread.status))
            )
                throw threadControlConflict(
                    'ThreadHasActiveOperation',
                    'Thread already has a running or paused operation.'
                )
            if (!thread.runControl) {
                await manager
                    .getRepository(XpertAgentExecution)
                    .createQueryBuilder()
                    .insert()
                    .values({
                        id: executionId,
                        tenantId: conversation.tenantId,
                        organizationId: conversation.organizationId,
                        createdById: conversation.createdById,
                        threadId,
                        agentKey: options.agentKey ?? 'general_agent',
                        xpertId: options.xpertId,
                        type: options.xpertId ? 'agent' : conversation.projectId ? 'project_agent' : 'chat',
                        status: XpertAgentExecutionStatusEnum.RUNNING
                    })
                    .orIgnore()
                    .execute()
                thread.runControl = { executionId, state: 'running' }
                thread.status = 'busy'
                await manager.save(thread)
            }
        })
        try {
            const stream = await execute(executionId)
            return new Observable<T>((subscriber) => {
                const subscription = stream.subscribe({
                    next: (value) => subscriber.next(value),
                    error: (error) => {
                        void this.finish(threadId, executionId).finally(() => subscriber.error(error))
                    },
                    complete: () => {
                        void this.finish(threadId, executionId).then(
                            () => subscriber.complete(),
                            (error) => subscriber.error(error)
                        )
                    }
                })
                return () => subscription.unsubscribe()
            })
        } catch (error) {
            await this.dataSource.getRepository(XpertAgentExecution).update(
                { id: executionId, status: XpertAgentExecutionStatusEnum.RUNNING },
                {
                    status: XpertAgentExecutionStatusEnum.ERROR
                }
            )
            await this.finish(threadId, executionId)
            throw error
        }
    }

    private async finish(threadId: string, executionId: string) {
        const thread = await this.dataSource.getRepository(ChatConversationThread).findOneBy({ threadId })
        if (thread?.runControl?.executionId !== executionId || thread.runControl.state === 'paused') return
        const execution = await this.dataSource.getRepository(XpertAgentExecution).findOneBy({ id: executionId })
        const conversation = await this.dataSource
            .getRepository(ChatConversation)
            .findOneBy({ id: thread.conversationId })
        const status =
            execution?.status === XpertAgentExecutionStatusEnum.SUCCESS
                ? 'idle'
                : execution?.status === XpertAgentExecutionStatusEnum.INTERRUPTED
                  ? 'interrupted'
                  : 'error'
        await this.control.finish(
            threadId,
            executionId,
            conversation?.operation ? 'interrupted' : status,
            execution?.error,
            conversation?.operation
        )
    }
}
