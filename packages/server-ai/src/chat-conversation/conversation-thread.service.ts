import { ChatThreadPurpose, TChatConversationStatus, TSensitiveOperation } from '@xpert-ai/contracts'
import { TenantOrganizationAwareCrudService } from '@xpert-ai/server-core'
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { v4 as uuidv4 } from 'uuid'
import { DataSource, EntityManager, FindOptionsOrder, FindOptionsWhere, In, IsNull, Repository } from 'typeorm'
import { threadControlConflict } from './thread-run-control.service'
import { ChatMessage } from '../chat-message/chat-message.entity'
import { CopilotCheckpoint } from '../copilot-checkpoint/copilot-checkpoint.entity'
import { CopilotCheckpointWrites } from '../copilot-checkpoint/writes/writes.entity'
import { ChatConversation } from './conversation.entity'
import { ChatConversationGoal } from './goal/conversation-goal.entity'
import { ChatConversationThread } from './conversation-thread.entity'
import { messageAncestorPath } from './message-path'

export type CopyConversationThreadInput = {
    metadata?: Record<string, unknown>
    beforeMessageId?: string
    requestId?: string
}

export type FindVisibleThreadMessagesOptions = {
    where?: FindOptionsWhere<ChatMessage>
    order?: FindOptionsOrder<ChatMessage>
    take?: number
    skip?: number
    relations?: string[]
}

@Injectable()
export class ChatConversationThreadService extends TenantOrganizationAwareCrudService<ChatConversationThread> {
    constructor(
        @InjectRepository(ChatConversationThread)
        public readonly repository: Repository<ChatConversationThread>,
        @InjectRepository(ChatMessage)
        private readonly messageRepository: Repository<ChatMessage>,
        @InjectRepository(ChatConversation)
        private readonly conversationRepository: Repository<ChatConversation>,
        private readonly dataSource: DataSource
    ) {
        super(repository)
    }

    async ensurePrimary(conversation: ChatConversation): Promise<ChatConversationThread> {
        const existing = await this.findByThreadId(conversation.threadId)
        if (existing) return existing

        const latestMessage = await this.messageRepository.findOne({
            where: [
                { conversationId: conversation.id, createdInThreadId: conversation.threadId },
                { conversationId: conversation.id, createdInThreadId: IsNull() }
            ],
            order: { createdAt: 'DESC' },
            select: { id: true }
        })

        try {
            const created = await this.create({
                threadId: conversation.threadId,
                conversationId: conversation.id,
                headMessageId: latestMessage?.id ?? null,
                status: conversation.status ?? 'idle',
                error: conversation.error ?? null,
                operation: conversation.operation ?? null,
                metadata: { primary: true }
            })
            created.conversation = conversation
            return created
        } catch (error) {
            const concurrent = await this.findByThreadId(conversation.threadId)
            if (concurrent) return concurrent
            throw error
        }
    }

    async findByThreadId(threadId: string): Promise<ChatConversationThread | null> {
        const normalizedThreadId = this.normalizeThreadId(threadId)
        const result = await this.findAllInOrganizationOrTenant({
            where: { threadId: normalizedThreadId },
            relations: ['conversation'],
            take: 1
        })
        return result.items[0] ?? null
    }

    async requireByThreadId(threadId: string): Promise<ChatConversationThread> {
        const thread = await this.findByThreadId(threadId)
        if (thread) return thread

        const legacyConversation = await this.conversationRepository.findOne({
            where: { threadId: this.normalizeThreadId(threadId) }
        })
        if (legacyConversation) return this.ensurePrimary(legacyConversation)
        throw new NotFoundException(`Thread "${threadId}" not found`)
    }

    async resolve(threadId: string, conversation?: ChatConversation): Promise<ChatConversationThread> {
        const existing = await this.findByThreadId(threadId)
        if (existing) return existing
        if (conversation?.threadId === threadId) return this.ensurePrimary(conversation)
        throw new NotFoundException(`Thread "${threadId}" not found`)
    }

    async listByConversation(conversationId: string): Promise<ChatConversationThread[]> {
        const result = await this.findAllInOrganizationOrTenant({
            where: { conversationId },
            order: { createdAt: 'ASC' }
        })
        return result.items
    }

    async copyThread(sourceThreadId: string, input: CopyConversationThreadInput = {}): Promise<ChatConversationThread> {
        const source = await this.requireByThreadId(sourceThreadId)
        const childThreadId = uuidv4()
        const editedMessage = input.beforeMessageId
            ? (await this.findVisibleMessages(sourceThreadId)).items.find(
                  (message) => message.id === input.beforeMessageId
              )
            : null
        if (
            input.beforeMessageId &&
            (!editedMessage || editedMessage.role !== 'human' || !editedMessage.inputCheckpoint)
        ) {
            throw threadControlConflict(
                'MessageCheckpointUnavailable',
                'This message has no saved input checkpoint and cannot be edited into a branch.'
            )
        }

        return this.dataSource.transaction(async (manager) => {
            const lockedSource = await manager.getRepository(ChatConversationThread).findOne({
                where: { id: source.id },
                lock: { mode: 'pessimistic_write' }
            })
            if (!lockedSource) throw new NotFoundException(`Thread "${sourceThreadId}" not found`)
            if (!editedMessage && lockedSource.status !== 'idle') {
                throw new ConflictException('Only an idle thread can be copied')
            }

            if (input.requestId) {
                // Raw() receives the unescaped alias path; Postgres folds it to lower case.
                const existing = await manager
                    .getRepository(ChatConversationThread)
                    .createQueryBuilder('thread')
                    .where('thread.parentThreadId = :parentThreadId', { parentThreadId: sourceThreadId })
                    .andWhere('thread.conversationId = :conversationId', { conversationId: source.conversationId })
                    .andWhere(`thread.metadata ->> 'forkRequestId' = :requestId`, { requestId: input.requestId })
                    .getOne()
                if (existing) {
                    if (existing.forkedFromMessageId !== input.beforeMessageId)
                        throw new ConflictException('Branch request does not match its source message')
                    existing.conversation = editedMessage
                        ? ((await this.promoteWorkingThread(manager, source.conversationId, existing.threadId)) ??
                          source.conversation)
                        : source.conversation
                    return existing
                }
            }

            const anchor = editedMessage?.inputCheckpoint
            const pinnedCheckpoint = anchor?.checkpoint
                ? await manager.getRepository(CopilotCheckpoint).findOne({
                      where: {
                          thread_id: anchor.checkpoint.threadId,
                          checkpoint_ns: anchor.checkpoint.checkpointNs,
                          checkpoint_id: anchor.checkpoint.checkpointId,
                          tenantId: lockedSource.tenantId,
                          organizationId: lockedSource.organizationId
                      }
                  })
                : null
            if (anchor?.checkpoint && !pinnedCheckpoint) {
                throw threadControlConflict('CheckpointUnavailable', 'The saved checkpoint is unavailable.')
            }

            const thread = manager.getRepository(ChatConversationThread).create({
                threadId: childThreadId,
                conversationId: lockedSource.conversationId,
                parentThreadId: lockedSource.threadId,
                headMessageId: editedMessage ? (editedMessage.parentId ?? null) : (lockedSource.headMessageId ?? null),
                forkedFromMessageId: editedMessage?.id ?? lockedSource.headMessageId ?? null,
                status: 'idle',
                error: null,
                operation: null,
                metadata: {
                    purpose: ChatThreadPurpose.SideChat,
                    primary: false,
                    ...(input.metadata ?? {}),
                    ...(editedMessage
                        ? {
                              purpose: ChatThreadPurpose.MessageEdit,
                              forkGraphRevision: anchor.graphRevision,
                              forkRequestId: input.requestId
                          }
                        : {})
                },
                tenantId: lockedSource.tenantId,
                organizationId: lockedSource.organizationId,
                createdById: lockedSource.createdById,
                updatedById: lockedSource.updatedById
            })
            const savedThread = await manager.save(thread)

            const checkpoints = editedMessage
                ? pinnedCheckpoint
                    ? [pinnedCheckpoint]
                    : []
                : await manager.getRepository(CopilotCheckpoint).find({
                      where: {
                          thread_id: lockedSource.threadId,
                          tenantId: lockedSource.tenantId,
                          organizationId: lockedSource.organizationId
                      }
                  })
            if (checkpoints.length > 0) {
                await manager.save(
                    CopilotCheckpoint,
                    checkpoints.map((checkpoint) =>
                        manager.getRepository(CopilotCheckpoint).create({
                            thread_id: childThreadId,
                            checkpoint_ns: checkpoint.checkpoint_ns,
                            checkpoint_id: checkpoint.checkpoint_id,
                            parent_id: editedMessage ? null : checkpoint.parent_id,
                            type: checkpoint.type,
                            checkpoint: checkpoint.checkpoint,
                            metadata: checkpoint.metadata,
                            tenantId: checkpoint.tenantId,
                            organizationId: checkpoint.organizationId,
                            createdById: checkpoint.createdById,
                            updatedById: checkpoint.updatedById
                        })
                    )
                )
            }

            // A new input forks the completed state, never the old input's pending writes.
            const writes = editedMessage
                ? []
                : await manager.getRepository(CopilotCheckpointWrites).find({
                      where: {
                          thread_id: lockedSource.threadId,
                          tenantId: lockedSource.tenantId,
                          organizationId: lockedSource.organizationId
                      }
                  })
            if (writes.length > 0) {
                await manager.save(
                    CopilotCheckpointWrites,
                    writes.map((write) =>
                        manager.getRepository(CopilotCheckpointWrites).create({
                            thread_id: childThreadId,
                            checkpoint_ns: write.checkpoint_ns,
                            checkpoint_id: write.checkpoint_id,
                            task_id: write.task_id,
                            idx: write.idx,
                            channel: write.channel,
                            type: write.type,
                            value: write.value,
                            tenantId: write.tenantId,
                            organizationId: write.organizationId,
                            createdById: write.createdById,
                            updatedById: write.updatedById
                        })
                    )
                )
            }

            const sourceGoal = editedMessage
                ? null
                : await manager.getRepository(ChatConversationGoal).findOne({
                      where: { conversationId: lockedSource.conversationId, threadId: lockedSource.threadId }
                  })
            if (sourceGoal) {
                await manager.save(
                    manager.getRepository(ChatConversationGoal).create({
                        conversationId: sourceGoal.conversationId,
                        threadId: childThreadId,
                        objective: sourceGoal.objective,
                        goalSpec: sourceGoal.goalSpec,
                        status: sourceGoal.status,
                        tokensUsed: sourceGoal.tokensUsed,
                        elapsedSeconds: sourceGoal.elapsedSeconds,
                        continuationCount: sourceGoal.continuationCount,
                        statusUpdatedAt: sourceGoal.statusUpdatedAt,
                        completedAt: sourceGoal.completedAt,
                        blockedAt: sourceGoal.blockedAt,
                        tenantId: sourceGoal.tenantId,
                        organizationId: sourceGoal.organizationId,
                        createdById: sourceGoal.createdById,
                        updatedById: sourceGoal.updatedById
                    })
                )
            }

            savedThread.conversation = editedMessage
                ? ((await this.promoteWorkingThread(manager, lockedSource.conversationId, childThreadId)) ??
                  source.conversation)
                : source.conversation
            return savedThread
        })
    }

    async claimForRun(threadId: string): Promise<ChatConversationThread> {
        const source = await this.requireByThreadId(threadId)
        return this.dataSource.transaction(async (manager) => {
            const thread = await manager.getRepository(ChatConversationThread).findOne({
                where: { id: source.id },
                lock: { mode: 'pessimistic_write' }
            })
            if (!thread) throw new NotFoundException(`Thread "${threadId}" not found`)
            if (['busy', 'pausing', 'paused'].includes(thread.status))
                throw threadControlConflict(
                    'ThreadHasActiveOperation',
                    'Thread already has a running or paused operation.'
                )
            thread.status = 'busy'
            thread.error = null
            thread.operation = null
            return manager.save(thread)
        })
    }

    async updateRuntimeState(
        threadId: string,
        status: TChatConversationStatus,
        error?: string | null,
        operation?: TSensitiveOperation | null
    ): Promise<void> {
        const thread = await this.requireByThreadId(threadId)
        await this.repository.manager
            .getRepository<
                Pick<ChatConversationThread, 'id' | 'status' | 'error' | 'operation'>
            >(ChatConversationThread)
            .update(thread.id, {
                status,
                error: error ?? null,
                operation: operation ?? null
            })
    }

    async advanceHead(threadId: string, messageId: string): Promise<void> {
        const thread = await this.requireByThreadId(threadId)
        const message = await this.messageRepository.findOne({
            where: { id: messageId, conversationId: thread.conversationId },
            select: { id: true }
        })
        if (!message) throw new NotFoundException(`Message "${messageId}" not found in thread conversation`)
        await this.repository.update(thread.id, { headMessageId: message.id })
    }

    async deleteBranchMessages(threadId: string): Promise<void> {
        await this.messageRepository.softDelete({ createdInThreadId: this.normalizeThreadId(threadId) })
    }

    async findVisibleMessages(
        threadId: string,
        options: FindVisibleThreadMessagesOptions = {}
    ): Promise<{ items: ChatMessage[]; total: number }> {
        const thread = await this.requireByThreadId(threadId)
        if (!thread.headMessageId) return { items: [], total: 0 }

        const head = await this.messageRepository.findOne({
            where: { id: thread.headMessageId, conversationId: thread.conversationId }
        })
        if (!head) return { items: [], total: 0 }

        const ancestors = await this.messageRepository.manager.getTreeRepository(ChatMessage).findAncestors(head)
        const messageIds = messageAncestorPath(ancestors, head.id).map((message) => message.id)
        if (messageIds.length === 0) return { items: [], total: 0 }

        const where: FindOptionsWhere<ChatMessage> = {
            ...(options.where ?? {}),
            conversationId: thread.conversationId,
            id: In(messageIds)
        }
        // Select the page by tree position before loading large message contents.
        const matching = new Set(
            (await this.messageRepository.find({ where, select: { id: true } })).map((message) => message.id)
        )
        const orderedIds = messageIds.filter((id) => matching.has(id))
        if (String(options.order?.createdAt).toUpperCase() === 'DESC') orderedIds.reverse()
        const offset = Math.max(0, options.skip ?? 0)
        const page = orderedIds.slice(
            offset,
            options.take === undefined ? undefined : offset + Math.max(0, options.take)
        )
        const items = page.length
            ? await this.messageRepository.find({
                  where: { ...where, id: In(page) },
                  relations: options.relations
              })
            : []
        const positions = new Map(page.map((id, index) => [id, index]))
        items.sort((left, right) => positions.get(left.id)! - positions.get(right.id)!)
        return { items, total: orderedIds.length }
    }

    async hydrateConversationMessages(conversation: ChatConversation, threadId: string): Promise<ChatConversation> {
        const thread = await this.requireByThreadId(threadId)
        const page = await this.findVisibleMessages(threadId, {
            relations: ['attachments', 'fileAssets'],
            order: { createdAt: 'ASC' }
        })
        conversation.messages = page.items
        conversation.status = thread.status
        conversation.error = thread.error ?? undefined
        conversation.operation = thread.operation ?? undefined
        return conversation
    }

    // Why this exists: conversation.threadId is the latest working branch. Message-edit
    // replaces it so history, /by-thread, and refresh open the branch instead of the abandoned primary.
    private async promoteWorkingThread(
        manager: EntityManager,
        conversationId: string,
        threadId: string
    ): Promise<ChatConversation | null> {
        const conversations = manager.getRepository(ChatConversation)
        const conversation = await conversations.findOne({
            where: { id: conversationId },
            lock: { mode: 'pessimistic_write' }
        })
        if (!conversation) return null
        if (conversation.threadId === threadId) return conversation
        conversation.threadId = threadId
        return conversations.save(conversation)
    }

    private normalizeThreadId(threadId: string): string {
        const normalized = threadId?.trim()
        if (!normalized) throw new NotFoundException('Thread id is required')
        return normalized
    }
}
