import { omit } from 'lodash'
import { McpAppHistory } from '../mcp-app-runtime/mcp-app-history.entity'
import { collectMcpAppComponentData } from '../mcp-app-runtime/mcp-app-history-component'
import {
    ChatThreadPurpose,
    isRuntimeChatMessage,
    TChatConversationStatus,
    TSensitiveOperation
} from '@xpert-ai/contracts'
import { TenantOrganizationAwareCrudService } from '@xpert-ai/server-core'
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { QueryBus } from '@nestjs/cqrs'
import { v4 as uuidv4 } from 'uuid'
import { DataSource, EntityManager, FindOptionsOrder, FindOptionsWhere, In, IsNull, Repository } from 'typeorm'
import { threadControlConflict, threadGraphRevision } from './thread-run-control.service'
import { recoveryConflict } from './recovery/recovery-error'
import { GetXpertWorkflowQuery, TXpertWorkflowQueryOutput } from '../xpert/queries/get-xpert-workflow.query'
import { ChatMessage } from '../chat-message/chat-message.entity'
import { CopilotCheckpoint } from '../copilot-checkpoint/copilot-checkpoint.entity'
import { CopilotCheckpointWrites } from '../copilot-checkpoint/writes/writes.entity'
import { ChatConversation } from './conversation.entity'
import { ChatConversationGoal } from './goal/conversation-goal.entity'
import { ChatConversationThread } from './conversation-thread.entity'
import { messageAncestorPath } from './message-path'
import { SideChatForkService } from './side-chat-fork.service'
import type { CopyConversationThreadInput } from './thread-copy.schema'
export type { CopyConversationThreadInput } from './thread-copy.schema'

export type FindVisibleThreadMessagesOptions = {
    where?: FindOptionsWhere<ChatMessage>
    order?: FindOptionsOrder<ChatMessage>
    take?: number
    skip?: number
    relations?: string[]
    /** Display-only call events never enter model ancestry or fork checkpoints. */
    includeCallEvents?: boolean
    /** Runtime hydration/retries retain internal inputs; public history never requests this. */
    includeRuntimeMessages?: boolean
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
        private readonly dataSource: DataSource,
        private readonly sideChats: SideChatForkService,
        private readonly queryBus: QueryBus
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
        if (input.mode === 'latest-sealed-reply') return this.sideChats.copy(source, input)
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

        if (editedMessage) {
            const anchor = editedMessage.inputCheckpoint
            if (anchor.version !== 1 || !anchor.graphRevision || !source.conversation?.xpertId)
                throw recoveryConflict('conversation_recovery_unavailable', source.error, sourceThreadId)
            const workflow = await this.queryBus.execute<GetXpertWorkflowQuery, TXpertWorkflowQueryOutput>(
                new GetXpertWorkflowQuery(source.conversation.xpertId)
            )
            if (threadGraphRevision(workflow.graph) !== anchor.graphRevision)
                throw recoveryConflict('conversation_graph_changed', source.error, sourceThreadId)
        }

        return this.dataSource.transaction(async (manager) => {
            const lockedSource = await manager.getRepository(ChatConversationThread).findOne({
                where: { id: source.id },
                lock: { mode: 'pessimistic_write' }
            })
            if (!lockedSource) throw new NotFoundException(`Thread "${sourceThreadId}" not found`)

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
                    if (existing.metadata.forkMode)
                        throw threadControlConflict(
                            'BranchRequestInvalid',
                            'Branch mode does not match the original request.'
                        )
                    if (
                        (existing.metadata.purpose === ChatThreadPurpose.MessageEdit
                            ? existing.forkedFromMessageId
                            : undefined) !== input.beforeMessageId
                    )
                        throw threadControlConflict(
                            'BranchRequestInvalid',
                            'Branch request does not match its source message.'
                        )
                    // Retrying a lost copy response never changes the selected branch.
                    existing.conversation = source.conversation
                    return existing
                }
            }

            if (!editedMessage && lockedSource.status !== 'idle') {
                throw new ConflictException('Only an idle thread can be copied')
            }

            const anchor = editedMessage?.inputCheckpoint
            const workingConversation = editedMessage
                ? await manager.getRepository(ChatConversation).findOne({
                      where: {
                          id: source.conversationId,
                          tenantId: source.tenantId,
                          organizationId: source.organizationId ?? IsNull()
                      },
                      lock: { mode: 'pessimistic_write' }
                  })
                : null
            if (editedMessage && !workingConversation) throw new NotFoundException('Conversation not found')
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
                    ...omit(input.metadata ?? {}, ['editAdmission', 'forkGraphRevision', 'forkRequestId']),
                    ...(input.requestId ? { forkRequestId: input.requestId } : {}),
                    ...(editedMessage
                        ? {
                              purpose: ChatThreadPurpose.MessageEdit,
                              forkGraphRevision: anchor.graphRevision,
                              forkRequestId: input.requestId,
                              editAdmission: {
                                  version: 1,
                                  state: 'pending',
                                  workingThreadId: workingConversation.threadId,
                                  workingThreadRevision: workingConversation.workingThreadRevision ?? 0
                              }
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

            savedThread.conversation = workingConversation ?? source.conversation
            return savedThread
        })
    }

    async claimForRun(threadId: string): Promise<ChatConversationThread> {
        const source = await this.requireByThreadId(threadId)
        if (source.metadata?.forkGraphRevision) {
            const workflow = await this.queryBus.execute<GetXpertWorkflowQuery, TXpertWorkflowQueryOutput>(
                new GetXpertWorkflowQuery(source.conversation.xpertId)
            )
            if (threadGraphRevision(workflow.graph) !== source.metadata.forkGraphRevision)
                throw recoveryConflict('conversation_graph_changed', source.error, source.parentThreadId)
        }
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
        // The operation is already validated JSON; avoid recursively expanding its message graph in TypeORM.
        await this.repository.manager
            .getRepository<
                Pick<ChatConversationThread, 'id' | 'status' | 'error'> & { operation?: object | null }
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
        const thread = await this.requireByThreadId(threadId)
        await this.dataSource.transaction(async (manager) => {
            const scope = { tenantId: thread.tenantId, organizationId: thread.organizationId ?? IsNull() }
            const where = { ...scope, conversationId: thread.conversationId, createdInThreadId: thread.threadId }
            const messages = await manager.find(ChatMessage, {
                where,
                select: { id: true, content: true, events: true }
            })
            const ids = messages.flatMap((message) =>
                [...collectMcpAppComponentData(message.events), ...collectMcpAppComponentData(message.content)].map(
                    (component) => component.appInstanceId
                )
            )
            if (ids.length) await manager.delete(McpAppHistory, { ...scope, id: In(ids) })
            await manager.softDelete(ChatMessage, where)
        })
    }

    async findVisibleMessages(
        threadId: string,
        options: FindVisibleThreadMessagesOptions = {}
    ): Promise<{ items: ChatMessage[]; total: number }> {
        const thread = await this.requireByThreadId(threadId)
        const head = thread.headMessageId
            ? await this.messageRepository.findOne({
                  where: { id: thread.headMessageId, conversationId: thread.conversationId }
              })
            : null
        const ancestors = head
            ? await this.messageRepository.manager.getTreeRepository(ChatMessage).findAncestors(head)
            : []
        const path = head ? messageAncestorPath(ancestors, head.id) : []
        if (options.includeCallEvents) {
            const calls = await this.messageRepository
                .createQueryBuilder('message')
                .select(['message.id', 'message.createdAt'])
                .where('message."conversationId" = :conversationId AND message."createdInThreadId" = :threadId', thread)
                .andWhere('message."tenantId" = :tenantId AND message."organizationId" = :organizationId', thread)
                .andWhere("message.content::jsonb -> 0 ->> 'type' = :type", { type: 'call_ended' })
                .orderBy('message.createdAt', 'ASC')
                .addOrderBy('message.id', 'ASC')
                .getMany()
            for (const call of calls) {
                const index = path.findIndex((message) => message.createdAt > call.createdAt)
                path.splice(index < 0 ? path.length : index, 0, call)
            }
        }
        const messageIds = path
            .filter((message) => options.includeRuntimeMessages || !isRuntimeChatMessage(message))
            .map((message) => message.id)
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
            includeRuntimeMessages: true,
            relations: ['attachments', 'fileAssets'],
            order: { createdAt: 'ASC' }
        })
        conversation.messages = page.items
        conversation.status = thread.status
        conversation.error = thread.error ?? undefined
        conversation.operation = thread.operation ?? undefined
        return conversation
    }

    private normalizeThreadId(threadId: string): string {
        const normalized = threadId?.trim()
        if (!normalized) throw new NotFoundException('Thread id is required')
        return normalized
    }
}
