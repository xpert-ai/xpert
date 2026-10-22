import { ChatThreadPurpose, TChatThreadRecovery } from '@xpert-ai/contracts'
import { ConflictException, Injectable } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { DataSource, IsNull } from 'typeorm'
import { XpertAgentExecution } from '../../xpert-agent-execution/agent-execution.entity'
import { GetXpertWorkflowQuery, TXpertWorkflowQueryOutput } from '../../xpert/queries/get-xpert-workflow.query'
import { ChatConversationThreadService } from '../conversation-thread.service'
import { ChatConversationThread } from '../conversation-thread.entity'
import { ChatConversation } from '../conversation.entity'
import { recoveryConflict } from './recovery-error'
import { resolveRetryInputCheckpointId } from './retry-checkpoint'
import { threadGraphRevision } from '../thread-run-control.service'

@Injectable()
export class ThreadRecoveryService {
    constructor(
        private readonly threads: ChatConversationThreadService,
        private readonly queryBus: QueryBus,
        private readonly database: DataSource
    ) {}

    /** Caller authorizes this exact thread; a source is always in the same conversation and scope. */
    async describe(threadId: string): Promise<TChatThreadRecovery> {
        const thread = await this.threads.requireByThreadId(threadId)
        const source = await this.source(thread)
        const result: TChatThreadRecovery = {
            threadId,
            canRetry: false,
            ...(source ? { sourceThreadId: source.threadId } : {})
        }
        if (['busy', 'pausing', 'paused'].includes(thread.status)) return result
        const execution = await this.database.manager.findOne(XpertAgentExecution, {
            where: {
                threadId,
                parentId: IsNull(),
                tenantId: thread.tenantId,
                organizationId: thread.organizationId ?? IsNull()
            },
            order: { createdAt: 'DESC' }
        })
        if (!execution)
            return {
                ...result,
                ...(thread.error
                    ? { reason: 'conversation_recovery_unavailable' as const, originalError: thread.error }
                    : {})
            }
        result.executionId = execution.id
        result.originalError = execution.error ?? thread.error ?? undefined
        if (!execution.checkpointId && !execution.metadata?.recovery?.input)
            return { ...result, reason: 'conversation_recovery_unavailable' }
        const workflow = await this.queryBus.execute<GetXpertWorkflowQuery, TXpertWorkflowQueryOutput>(
            new GetXpertWorkflowQuery(thread.conversation.xpertId)
        )
        const graphRevision = threadGraphRevision(workflow.graph)
        if (thread.metadata?.forkGraphRevision && thread.metadata.forkGraphRevision !== graphRevision)
            return { ...result, reason: 'conversation_graph_changed' }
        try {
            await resolveRetryInputCheckpointId(
                this.queryBus,
                threadId,
                execution.checkpointNs,
                execution.checkpointId,
                { execution, graphRevision }
            )
            return { ...result, canRetry: true }
        } catch (error) {
            if (!(error instanceof ConflictException)) throw error
            const response = error.getResponse()
            const reason =
                typeof response === 'object' && 'code' in response && response.code === 'conversation_graph_changed'
                    ? 'conversation_graph_changed'
                    : 'conversation_recovery_unavailable'
            return { ...result, reason }
        }
    }

    async getSourceThreadId(threadId: string): Promise<string> {
        const thread = await this.threads.requireByThreadId(threadId)
        const source = await this.source(thread)
        if (!source) throw recoveryConflict('conversation_recovery_unavailable', thread.error)
        return source.threadId
    }

    async returnToSource(threadId: string): Promise<ChatConversationThread> {
        const thread = await this.threads.requireByThreadId(threadId)
        const source = await this.source(thread)
        if (!source) throw recoveryConflict('conversation_recovery_unavailable', thread.error)
        return this.database.transaction(async (manager) => {
            const locked = await manager.findOne(ChatConversationThread, {
                where: { id: thread.id },
                lock: { mode: 'pessimistic_write' }
            })
            if (!locked || ['busy', 'pausing', 'paused'].includes(locked.status))
                throw recoveryConflict('conversation_recovery_unavailable', locked?.error)
            const currentSource = await manager.findOne(ChatConversationThread, {
                where: {
                    threadId: source.threadId,
                    conversationId: thread.conversationId,
                    tenantId: thread.tenantId,
                    organizationId: thread.organizationId ?? IsNull()
                },
                lock: { mode: 'pessimistic_write' }
            })
            if (!currentSource) throw recoveryConflict('conversation_recovery_unavailable', thread.error)
            const conversation = await manager.findOne(ChatConversation, {
                where: {
                    id: thread.conversationId,
                    tenantId: thread.tenantId,
                    organizationId: thread.organizationId ?? IsNull()
                },
                lock: { mode: 'pessimistic_write' }
            })
            if (!conversation) throw recoveryConflict('conversation_recovery_unavailable')
            if (conversation.threadId !== source.threadId) {
                if (conversation.threadId !== threadId) throw recoveryConflict('conversation_branch_selection_changed')
                conversation.threadId = source.threadId
                conversation.workingThreadRevision = (conversation.workingThreadRevision ?? 0) + 1
                conversation.status = currentSource.status
                conversation.error = currentSource.error
                conversation.operation = currentSource.operation
                await manager.save(conversation)
            }
            currentSource.conversation = conversation
            return currentSource
        })
    }

    private async source(thread: ChatConversationThread) {
        if (thread.metadata?.purpose !== ChatThreadPurpose.MessageEdit || !thread.parentThreadId) return null
        const source = await this.threads.findByThreadId(thread.parentThreadId)
        return source?.conversationId === thread.conversationId &&
            source.tenantId === thread.tenantId &&
            source.organizationId === thread.organizationId
            ? source
            : null
    }
}
