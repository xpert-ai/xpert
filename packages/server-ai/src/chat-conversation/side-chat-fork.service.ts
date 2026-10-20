// Invariants: the fork uses a sealed message boundary, never the running thread's latest state.
// Service reads precede the transaction; the source row lock serializes retries, not graph execution.
import { ConflictException, Injectable } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { DataSource, EntityManager, IsNull } from 'typeorm'
import { randomUUID } from 'node:crypto'
import { t } from 'i18next'
import { ChatThreadPurpose } from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/plugin-sdk'
import { ChatMessage } from '../chat-message/chat-message.entity'
import { branchMessagePathHash, messageBranching } from '../chat-message/message-branching'
import { CopilotCheckpointSaver } from '../copilot-checkpoint/checkpoint-saver'
import { GetXpertWorkflowQuery, TXpertWorkflowQueryOutput } from '../xpert/queries/get-xpert-workflow.query'
import { branchConflict, copyBranchCheckpoints } from './conversation-branch/branch-checkpoints'
import { ChatConversationThread } from './conversation-thread.entity'
import { messageAncestorPath } from './message-path'
import { threadGraphRevision } from './thread-run-control.service'
import type { CopyConversationThreadInput } from './thread-copy.schema'

@Injectable()
export class SideChatForkService {
    constructor(
        private readonly dataSource: DataSource,
        private readonly checkpoints: CopilotCheckpointSaver,
        private readonly queryBus: QueryBus
    ) {}

    async copy(source: ChatConversationThread, input: CopyConversationThreadInput): Promise<ChatConversationThread> {
        // A lost response must remain retryable after the source advances or its checkpoint expires.
        const existing = await this.findExisting(this.dataSource.manager, source, input)
        if (existing) return existing
        if (!source.conversation?.xpertId) throw branchConflict('state_not_supported')
        const prepared = await this.loadBoundary(this.dataSource.manager, source)
        // Pin the boundary before workflow lookup; a later reply must not move this attempt's fork point.
        const checkpointSnapshot = JSON.stringify(prepared.outputCheckpoint)
        const graphRevision = prepared.outputCheckpoint.graphRevision
        const workflow = await this.queryBus.execute<GetXpertWorkflowQuery, TXpertWorkflowQueryOutput>(
            new GetXpertWorkflowQuery(source.conversation.xpertId)
        )
        if (threadGraphRevision(workflow.graph) !== graphRevision) throw branchConflict('graph_changed')

        return this.dataSource.transaction(async (manager) => {
            const threads = manager.getRepository(ChatConversationThread)
            const locked = await threads.findOne({
                where: { id: source.id, conversationId: source.conversationId },
                lock: { mode: 'pessimistic_write' }
            })
            if (!locked) throw branchConflict('message_not_in_thread')
            const concurrent = await this.findExisting(manager, source, input)
            if (concurrent) return concurrent
            const selected = await this.loadBoundary(manager, locked, prepared.id)
            if (JSON.stringify(selected.outputCheckpoint) !== checkpointSnapshot)
                throw branchConflict('checkpoint_unavailable')

            const threadId = randomUUID()
            const allowedThreads = await threads.find({
                where: {
                    conversationId: source.conversationId,
                    tenantId: source.tenantId,
                    organizationId: source.organizationId ?? IsNull()
                }
            })
            await copyBranchCheckpoints({
                manager,
                serializer: this.checkpoints.serde,
                messages: [selected],
                targetThreadId: threadId,
                tenantId: source.tenantId,
                organizationId: source.organizationId,
                userId: RequestContext.currentUserId() ?? source.createdById,
                allowedThreadIds: new Set(allowedThreads.map((thread) => thread.threadId)),
                // The conversation and its immutable history are shared, so message IDs stay unchanged.
                messageIds: new Map()
            })
            const child = await threads.save(
                threads.create({
                    threadId,
                    conversationId: source.conversationId,
                    parentThreadId: source.threadId,
                    headMessageId: selected.id,
                    forkedFromMessageId: selected.id,
                    status: 'idle',
                    error: null,
                    operation: null,
                    metadata: {
                        ...(input.metadata ?? {}),
                        primary: false,
                        purpose: ChatThreadPurpose.SideChat,
                        forkMode: 'latest-sealed-reply',
                        forkRequestId: input.requestId,
                        forkGraphRevision: selected.outputCheckpoint.graphRevision
                    },
                    tenantId: source.tenantId,
                    organizationId: source.organizationId,
                    createdById: RequestContext.currentUserId() ?? source.createdById,
                    updatedById: RequestContext.currentUserId() ?? source.updatedById
                })
            )
            // Goals, pending writes, queued inputs, runControl and the source head are deliberately untouched.
            child.conversation = source.conversation
            return child
        })
    }

    private async findExisting(
        manager: EntityManager,
        source: ChatConversationThread,
        input: CopyConversationThreadInput
    ) {
        const existing = await manager
            .getRepository(ChatConversationThread)
            .createQueryBuilder('thread')
            .where('thread.parentThreadId = :parentThreadId', { parentThreadId: source.threadId })
            .andWhere('thread.conversationId = :conversationId', { conversationId: source.conversationId })
            .andWhere(`thread.metadata ->> 'forkRequestId' = :requestId`, { requestId: input.requestId })
            .getOne()
        if (existing) {
            if (
                existing.metadata.purpose !== ChatThreadPurpose.SideChat ||
                existing.metadata.forkMode !== 'latest-sealed-reply'
            )
                throw branchConflict('request_conflict')
            existing.conversation = source.conversation
        }
        return existing
    }

    private async loadBoundary(manager: EntityManager, source: ChatConversationThread, selectedId?: string) {
        const messages = manager.getRepository(ChatMessage)
        const head = source.headMessageId
            ? await messages.findOne({ where: { id: source.headMessageId, conversationId: source.conversationId } })
            : null
        if (!head) throw this.noSealedReply()
        const ancestors = await manager.getTreeRepository(ChatMessage).findAncestors(head)
        const path = messageAncestorPath(ancestors, head.id, selectedId ?? head.id)
        // Provisional graph checkpoints are not sealed replies. Never select a sibling by timestamp.
        const selected = selectedId
            ? path[path.length - 1]
            : [...path]
                  .reverse()
                  .find(
                      (message) =>
                          message.role === 'ai' &&
                          message.outputCheckpoint?.messageHash &&
                          message.outputCheckpoint?.messagePathHash
                  )
        if (!selected) throw this.noSealedReply()
        const capability = messageBranching(selected)
        if (!capability?.available) throw branchConflict(capability?.reason ?? 'checkpoint_unavailable')
        const prefix = path.slice(0, path.indexOf(selected) + 1)
        if (selected.outputCheckpoint.messagePathHash !== branchMessagePathHash(prefix))
            throw branchConflict('checkpoint_unavailable')
        return selected
    }

    private noSealedReply() {
        return new ConflictException({
            code: 'side_chat_checkpoint_unavailable',
            message: t('server-ai:Error.SideChatCheckpointUnavailable')
        })
    }
}
