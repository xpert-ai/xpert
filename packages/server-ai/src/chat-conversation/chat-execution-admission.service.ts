// Invariants: all existing-conversation root entry points share the durable thread writer claim.
// A runtime reply may queue, but cannot clear a pause, approve an interaction or reverse a user stop.
import { AgentEventBinding } from '../agent-event/agent-event.entity'
import { FollowUpThreadBusy } from '../agent-event/follow-up-timer.constants'
import { ForbiddenException, Injectable } from '@nestjs/common'
import { getErrorMessage, RequestContext } from '@xpert-ai/plugin-sdk'
import { TChatRequest, TChatCheckpointReference, XpertAgentExecutionStatusEnum } from '@xpert-ai/contracts'
import { DataSource, EntityManager, IsNull } from 'typeorm'
import { randomUUID } from 'node:crypto'
import { EMPTY, Observable } from 'rxjs'
import { QueryBus } from '@nestjs/cqrs'
import type { ConversationContinuation } from './continuation'
import { AssertProjectConversationAdmissionQuery } from '../xpert-project/queries/assert-project-conversation-admission.query'
import { ChatConversation } from './conversation.entity'
import { ChatConversationThread } from './conversation-thread.entity'
import { XpertAgentExecution } from '../xpert-agent-execution/agent-execution.entity'
import { ThreadRunControlService, threadControlConflict } from './thread-run-control.service'
import { resolveResumeTarget, resumeTargetDenied } from './resolve-resume-target'

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
        private readonly control: ThreadRunControlService,
        private readonly queries?: QueryBus
    ) {}

    async run<T>(
        request: TChatRequest,
        options: {
            resumeCheckpoint?: TChatCheckpointReference
            automatic?: boolean
            continuation?: ConversationContinuation
            once?: boolean
            eventBinding?: { id: string; revision: number; fence: string }
            threadId?: string
            execution?: { id: string }
            xpertId?: string
            agentKey?: string
            context?: Record<string, unknown>
        },
        execute: (executionId?: string, request?: TChatRequest) => Promise<Observable<T>>
    ): Promise<Observable<T>> {
        if (options.continuation && !options.once) throw resumeTargetDenied()
        if (
            options.once &&
            (!options.execution?.id ||
                !request.conversationId ||
                request.action !== 'send' ||
                !RequestContext.currentUserId())
        )
            throw resumeTargetDenied()
        if (!request.conversationId || request.action === 'follow_up' || !RequestContext.currentUserId())
            return execute(options.execution?.id)
        const conversation = await this.dataSource.getRepository(ChatConversation).findOneBy({
            id: request.conversationId,
            tenantId: RequestContext.currentTenantId(),
            organizationId: RequestContext.getOrganizationId() ?? IsNull(),
            createdById: RequestContext.currentUserId()
        })
        // The handler retains authorization for other established actor types (e.g. end users).
        if (!conversation) {
            if (options.once || request.action === 'resume') throw resumeTargetDenied()
            return execute(options.execution?.id)
        }
        if (request.action === 'resume' && options.xpertId && conversation.xpertId !== options.xpertId)
            throw resumeTargetDenied()
        const threadId = options.threadId?.trim() || conversation.threadId
        let executionId = request.action === 'resume' ? undefined : (options.execution?.id ?? randomUUID())
        let admittedRequest = request
        const claimed = await this.dataSource.transaction(async (manager) => {
            if (options.eventBinding) {
                const binding = await manager.findOne(AgentEventBinding, {
                    where: {
                        id: options.eventBinding.id,
                        revision: options.eventBinding.revision,
                        tenantId: conversation.tenantId,
                        organizationId: conversation.organizationId,
                        userId: conversation.createdById,
                        xpertId: options.xpertId,
                        state: 'enabled'
                    },
                    select: { id: true },
                    lock: { mode: 'pessimistic_read' }
                })
                if (!binding) throw new ForbiddenException('event_access_changed')
                const [claim] = await manager.query(
                    `SELECT p.id FROM agent_event_partition p JOIN agent_event_inbox i ON i.partition=p.id
                     WHERE i.binding=$1 AND i.id=$2 AND i.state='processing' AND p.fence=$3 AND p.expires>now()
                     FOR SHARE OF p`,
                    [binding.id, executionId, options.eventBinding.fence]
                )
                if (!claim) throw new ForbiddenException('event_claim_expired')
            }
            if (request.action === 'resume') {
                const target = await resolveResumeTarget(
                    manager,
                    conversation,
                    threadId,
                    request,
                    options.resumeCheckpoint ? undefined : options.execution?.id
                )
                executionId = options.resumeCheckpoint
                    ? (options.execution?.id ?? target.executionId)
                    : target.executionId
                admittedRequest = { ...request, target }
            }
            const thread = await lockRuntimeThread(manager, conversation, threadId)
            if (!conversation.projectId) {
                // A move can commit between the initial scope lookup and the writer lock.
                const current = await manager
                    .getRepository(ChatConversation)
                    .findOne({ where: { id: conversation.id } })
                if (current?.projectId)
                    throw threadControlConflict(
                        'ConversationProjectChanged',
                        'Project changed before execution admission'
                    )
            }
            if (options.once) {
                const existing = await manager.getRepository(XpertAgentExecution).findOneBy({ id: executionId })
                if (existing) {
                    if (
                        existing.threadId !== threadId ||
                        existing.createdById !== conversation.createdById ||
                        existing.tenantId !== conversation.tenantId ||
                        existing.xpertId !== options.xpertId ||
                        (options.agentKey && existing.agentKey !== options.agentKey)
                    )
                        throw resumeTargetDenied()
                    // Admission and the writer claim commit together. Never replay an uncertain model/tool call.
                    return 'already_admitted'
                }
            }
            if (conversation.projectId) {
                if (!this.queries) throw resumeTargetDenied()
                const target =
                    admittedRequest.action === 'retry'
                        ? admittedRequest.source
                        : admittedRequest.action === 'resume'
                          ? admittedRequest.target
                          : undefined
                await this.queries.execute(
                    new AssertProjectConversationAdmissionQuery(
                        manager,
                        {
                            conversationId: conversation.id,
                            threadId,
                            projectId: conversation.projectId,
                            executionId,
                            headMessageId: thread.headMessageId
                        },
                        options.continuation?.sourceMessageId,
                        target && { ...target, aiMessageId: target.aiMessageId ?? thread.headMessageId }
                    )
                )
            }
            if (
                options.eventBinding &&
                (thread.status === 'paused' || thread.status === 'pausing' || thread.runtimeContinuationBlockedAt)
            ) {
                throw new ForbiddenException('event_thread_requires_user')
            }
            if (options.eventBinding && (thread.runControl || thread.status === 'busy')) throw new FollowUpThreadBusy()
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
            if (request.action === 'resume') return false
            if (!thread.runControl) {
                const insert = manager
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
                if (options.once) {
                    const inserted = await insert.returning('id').updateEntity(false).execute()
                    if (!inserted.raw.length) throw resumeTargetDenied()
                } else {
                    await insert.execute()
                }
                thread.runControl = { executionId, state: 'running' }
                thread.status = 'busy'
                await manager.save(thread)
                return true
            }
            return false
        })
        if (claimed === 'already_admitted') return EMPTY
        // Reject duplicate decisions before entering the cleanup path for an admitted run.
        if (request.action === 'resume' && !options.execution?.id)
            await this.control.start(threadId, executionId, options.context, true)
        // Automatic replies pre-reserved the writer. Establish ownership outside cleanup:
        // a rejected duplicate must not finalize another process's admitted execution.
        if (options.automatic) await this.control.start(threadId, executionId, options.context)
        try {
            // Preassigned execution IDs bypass the handler's direct-run start.
            if (claimed) await this.control.start(threadId, executionId, options.context)
            const stream = await execute(executionId, admittedRequest)
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
                    status: XpertAgentExecutionStatusEnum.ERROR,
                    error: getErrorMessage(error)
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
