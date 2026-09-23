// Invariants: independent conversations own their messages/checkpoints. Source IDs are audit
// data only; no target FK may cascade when the source conversation is deleted.
// Service authorization reads run before the transaction. Once locked, all database
// work uses its manager so a saturated connection pool cannot deadlock branching.
import { Injectable, Logger, ForbiddenException, BadRequestException, HttpException } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { RequestContext } from '@xpert-ai/server-core'
import { DataSource, EntityManager, In, IsNull } from 'typeorm'
import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { t } from 'i18next'
import type { TConversationBranchRequest } from '@xpert-ai/contracts'
import { ChatConversationService } from './conversation.service'
import { ChatConversationThreadService } from './conversation-thread.service'
import { ChatConversation } from './conversation.entity'
import { ChatConversationThread } from './conversation-thread.entity'
import { ChatMessage } from '../chat-message/chat-message.entity'
import { ChatMessageService } from '../chat-message/chat-message.service'
import { branchMessageHash, branchMessagePathHash, messageBranching } from '../chat-message/message-branching'
import { sanitizeMessageContentForPersistence } from '../chat-message/message-step-persistence'
import { CopilotCheckpointSaver } from '../copilot-checkpoint/checkpoint-saver'
import { ConversationFileLink } from '../file-understanding/entities/conversation-file-link.entity'
import { FileAssetAccessService } from '../file-understanding/file-asset-access.service'
import { PublishedXpertAccessService } from '../xpert/published-xpert-access.service'
import { XpertProjectService } from '../xpert-project/project.service'
import { assertPublicXpertSessionConversationAccess } from '../ai/public-xpert-principal'
import { GetXpertWorkflowQuery, TXpertWorkflowQueryOutput } from '../xpert/queries/get-xpert-workflow.query'
import {
    branchConflict,
    copyBranchCheckpoints,
    rebindInputCheckpoint,
    rebindOutputCheckpoint
} from './branch-checkpoints'
import { threadGraphRevision } from './thread-run-control.service'
import { messageAncestorPath } from './message-path'
import { applicationMetrics } from '../metrics'
import { rebindTaskSummary } from './branch-message-references'

const requestSchema = z.object({
    sourceThreadId: z.string().trim().min(1).max(100),
    afterMessageId: z.string().uuid(),
    requestId: z.string().uuid()
})

@Injectable()
export class ConversationBranchService {
    private readonly logger = new Logger(ConversationBranchService.name)

    constructor(
        private readonly dataSource: DataSource,
        private readonly conversations: ChatConversationService,
        private readonly threads: ChatConversationThreadService,
        private readonly messages: ChatMessageService,
        private readonly publishedXperts: PublishedXpertAccessService,
        private readonly projects: XpertProjectService,
        private readonly files: FileAssetAccessService,
        private readonly checkpoints: CopilotCheckpointSaver,
        private readonly queryBus: QueryBus
    ) {}

    /** Create an idle, independently owned conversation without invoking or resuming the source run. */
    async branch(conversationId: string, body: TConversationBranchRequest): Promise<ChatConversation> {
        const started = Date.now()
        let copiedSize: { messages: number; checkpoints: number } | undefined
        try {
            const parsed = requestSchema.safeParse(body)
            if (!parsed.success) throw new BadRequestException(t('server-ai:Error.ConversationBranch.invalid_request'))
            const input: TConversationBranchRequest = {
                sourceThreadId: parsed.data.sourceThreadId,
                afterMessageId: parsed.data.afterMessageId,
                requestId: parsed.data.requestId
            }
            const userId = RequestContext.currentUserId()
            if (!userId) throw new ForbiddenException(t('server-ai:Error.ConversationUserContextRequired'))
            const source = await this.conversations.assertAccess(conversationId, 'contribute')
            await assertPublicXpertSessionConversationAccess(source, this.queryBus)
            if (!source.xpertId) throw branchConflict('state_not_supported')
            await this.publishedXperts.getAccessiblePublishedXpert(source.xpertId)
            if (source.projectId) await this.projects.assertRuntimeAccess(source.projectId, source.xpertId)
            const sourceThread = await this.threads.requireByThreadId(input.sourceThreadId)
            if (sourceThread.conversationId !== source.id) throw branchConflict('message_not_in_thread')

            // A completed retry remains valid even if the original checkpoint or file has since disappeared.
            const existing = await this.findExistingBranch(this.dataSource.manager, source, input, userId)
            const prepared = existing ? null : await this.prepareBranch(source, sourceThread, input, userId)
            const result =
                existing ??
                (await this.dataSource.transaction(async (manager) => {
                    const threadRepository = manager.getRepository(ChatConversationThread)
                    const locked = await threadRepository.findOne({
                        where: { id: sourceThread.id },
                        lock: { mode: 'pessimistic_write' }
                    })
                    if (!locked || locked.conversationId !== source.id) throw branchConflict('message_not_in_thread')
                    // The preflight lookup is only a fast path; the source-row lock serializes duplicate requests.
                    const concurrent = await this.findExistingBranch(manager, source, input, userId)
                    if (concurrent) return concurrent

                    const { path, selected, anchor } = await this.loadBranchPath(
                        manager,
                        source.id,
                        locked.headMessageId,
                        input
                    )
                    // Reject mutations inside the authorized prefix; later messages outside it may keep arriving.
                    if (branchPathSnapshot(path) !== prepared.snapshot) throw branchConflict('checkpoint_unavailable')
                    const { target, authorizedPath, assetIds } = prepared
                    const { id, threadId } = target
                    const messageIds = new Map(path.map((message) => [message.id, randomUUID()]))
                    const allowedThreads = await threadRepository.find({ where: { conversationId: source.id } })
                    const allowedThreadIds = new Set(allowedThreads.map((thread) => thread.threadId))
                    const conversations = manager.getRepository(ChatConversation)
                    const messages = manager.getRepository(ChatMessage)
                    await conversations.save(target)
                    const count = await copyBranchCheckpoints({
                        manager,
                        serializer: this.checkpoints.serde,
                        messages: path,
                        targetThreadId: threadId,
                        tenantId: source.tenantId,
                        organizationId: source.organizationId,
                        userId,
                        allowedThreadIds,
                        messageIds
                    })
                    // Insert parents first so TypeORM rebuilds the target's own closure table.
                    const copiedHistory: ChatMessage[] = []
                    for (const message of authorizedPath) {
                        const parentId = message.parentId ? messageIds.get(message.parentId) : null
                        const copied = messages.create({
                            id: messageIds.get(message.id),
                            conversationId: id,
                            createdInThreadId: threadId,
                            parent: parentId ? { id: parentId } : null,
                            role: message.role,
                            content: sanitizeMessageContentForPersistence(message.content),
                            reasoning: message.reasoning,
                            references: message.references,
                            status: message.status,
                            error: message.error,
                            events: sanitizeMessageContentForPersistence(message.events),
                            taskSummary: rebindTaskSummary(message.taskSummary, messageIds),
                            attachments: message.attachments,
                            fileAssets: message.fileAssets,
                            thirdPartyMessage: message.thirdPartyMessage,
                            inputCheckpoint: rebindInputCheckpoint(message.inputCheckpoint, threadId),
                            outputCheckpoint: rebindOutputCheckpoint(message.outputCheckpoint, threadId),
                            historicalAgentRuns:
                                message.historicalAgentRuns ?? message.outputCheckpoint?.agentRuns ?? [],
                            // Copying history must not make old replies appear to have been sent now.
                            createdAt: message.createdAt,
                            updatedAt: message.updatedAt,
                            tenantId: source.tenantId,
                            organizationId: source.organizationId,
                            createdById: userId,
                            updatedById: userId
                        })
                        copiedHistory.push(copied)
                        if (copied.outputCheckpoint) {
                            copied.outputCheckpoint.messageHash = branchMessageHash(copied)
                            copied.outputCheckpoint.messagePathHash = branchMessagePathHash(copiedHistory)
                        }
                        await messages.save(copied)
                    }
                    const links = manager.getRepository(ConversationFileLink)
                    for (const fileAssetId of assetIds) {
                        const sourceLink = await links.findOne({
                            where: {
                                conversationId: source.id,
                                fileAssetId,
                                tenantId: source.tenantId,
                                organizationId: source.organizationId ?? IsNull()
                            }
                        })
                        if (!sourceLink)
                            throw new ForbiddenException(t('server-ai:Error.ConversationBranch.files_unavailable'))
                        await links.save(
                            links.create({
                                conversationId: id,
                                threadId,
                                fileAssetId,
                                storageFileId: sourceLink.storageFileId,
                                tenantId: source.tenantId,
                                organizationId: source.organizationId,
                                createdById: userId,
                                updatedById: userId
                            })
                        )
                    }
                    await threadRepository.save(
                        threadRepository.create({
                            threadId,
                            conversationId: id,
                            headMessageId: messageIds.get(selected.id),
                            status: 'idle',
                            metadata: { primary: true, forkGraphRevision: anchor.graphRevision },
                            tenantId: source.tenantId,
                            organizationId: source.organizationId,
                            createdById: userId,
                            updatedById: userId
                        })
                    )
                    this.logger.log(`Conversation branch prepared: messages=${path.length} checkpoints=${count}`)
                    copiedSize = { messages: path.length, checkpoints: count }
                    return target
                }))
            this.logger.log(`Conversation branch succeeded: elapsedMs=${Date.now() - started}`)
            applicationMetrics.recordConversationBranch({
                outcome: 'success',
                reason: copiedSize ? 'created' : 'idempotent_retry',
                durationMs: Date.now() - started,
                ...copiedSize
            })
            return result
        } catch (error) {
            const code = z
                .object({
                    code: z.enum([
                        'message_not_in_thread',
                        'message_not_complete',
                        'checkpoint_unavailable',
                        'graph_changed',
                        'state_not_supported',
                        'request_conflict'
                    ])
                })
                .safeParse(error instanceof HttpException ? error.getResponse() : null)
            const reason = code.success
                ? code.data.code
                : error instanceof HttpException
                  ? `http_${error.getStatus()}`
                  : 'internal_error'
            this.logger.warn(`Conversation branch failed: elapsedMs=${Date.now() - started} reason=${reason}`)
            applicationMetrics.recordConversationBranch({
                outcome: 'failure',
                reason,
                durationMs: Date.now() - started
            })
            throw error
        }
    }

    /** Resolve a retry within its user/thread scope and reject reuse with different branch parameters. */
    private async findExistingBranch(
        manager: EntityManager,
        source: ChatConversation,
        input: TConversationBranchRequest,
        userId: string
    ) {
        const existing = await manager
            .getRepository(ChatConversation)
            .createQueryBuilder('conversation')
            .where('conversation.tenantId = :tenantId', { tenantId: source.tenantId })
            .andWhere('conversation.createdById = :userId', { userId })
            .andWhere(`conversation."branchSource" ->> 'threadId' = :threadId`, {
                threadId: input.sourceThreadId
            })
            .andWhere(`conversation."branchSource" ->> 'requestId' = :requestId`, {
                requestId: input.requestId
            })
            .getOne()
        if (existing) {
            if (
                existing.branchSource?.messageId !== input.afterMessageId ||
                existing.branchSource?.conversationId !== source.id ||
                (existing.organizationId ?? null) !== (source.organizationId ?? null)
            )
                throw branchConflict('request_conflict')
        }
        return existing
    }

    /** Load the complete tree prefix server-side and verify its contents still match the sealed boundary. */
    private async loadBranchPath(
        manager: EntityManager,
        conversationId: string,
        headMessageId: string | null | undefined,
        input: TConversationBranchRequest
    ) {
        if (!headMessageId) throw branchConflict('message_not_in_thread')
        const messages = manager.getRepository(ChatMessage)
        const head = await messages.findOne({ where: { id: headMessageId, conversationId } })
        if (!head) throw branchConflict('message_not_in_thread')
        const ancestors = await manager.getTreeRepository(ChatMessage).findAncestors(head)
        const pathIds = messageAncestorPath(ancestors, head.id, input.afterMessageId).map((message) => message.id)
        const loaded = await messages.find({
            where: { id: In(pathIds), conversationId },
            relations: ['attachments', 'fileAssets']
        })
        const loadedById = new Map(loaded.map((message) => [message.id, message]))
        const path = pathIds.map((id) => {
            const message = loadedById.get(id)
            if (!message) throw branchConflict('checkpoint_unavailable')
            return message
        })
        const selected = path[path.length - 1]
        const capability = messageBranching(selected)
        if (!capability?.available) throw branchConflict(capability?.reason ?? 'message_not_complete')
        const anchor = selected.outputCheckpoint!
        if (anchor.messagePathHash !== branchMessagePathHash(path)) throw branchConflict('checkpoint_unavailable')
        return { path, selected, anchor }
    }

    /**
     * Resolve graph and file authorization before acquiring the transaction's connection.
     * Return a snapshot to recheck under the thread lock; do not call these services inside that lock.
     */
    private async prepareBranch(
        source: ChatConversation,
        sourceThread: ChatConversationThread,
        input: TConversationBranchRequest,
        userId: string
    ) {
        const { path, anchor } = await this.loadBranchPath(
            this.dataSource.manager,
            source.id,
            sourceThread.headMessageId,
            input
        )
        const snapshot = branchPathSnapshot(path)
        const workflow = await this.queryBus.execute<GetXpertWorkflowQuery, TXpertWorkflowQueryOutput>(
            new GetXpertWorkflowQuery(source.xpertId)
        )
        if (threadGraphRevision(workflow.graph) !== anchor.graphRevision) throw branchConflict('graph_changed')

        const threadId = randomUUID()
        const id = randomUUID()
        const options = { ...(anchor.options ?? {}) }
        delete options.sessionWorkspacePath
        const target = this.dataSource.manager.getRepository(ChatConversation).create({
            id,
            threadId,
            title: t('server-ai:ConversationBranch.Title', { title: source.title || 'Chat' }),
            xpertId: source.xpertId,
            projectId: source.projectId,
            options,
            status: 'idle',
            from: 'api',
            fromEndUserId: source.fromEndUserId,
            tenantId: source.tenantId,
            organizationId: source.organizationId,
            createdById: userId,
            updatedById: userId,
            branchSource: {
                conversationId: source.id,
                threadId: input.sourceThreadId,
                messageId: input.afterMessageId,
                requestId: input.requestId
            }
        })
        const authorizedPath: ChatMessage[] = []
        for (const message of path) {
            const authorized = await this.messages.filterAuthorizedFileRelations(message, source.id)
            if (
                (authorized.attachments?.length ?? 0) !== (message.attachments?.length ?? 0) ||
                (authorized.fileAssets?.length ?? 0) !== (message.fileAssets?.length ?? 0)
            )
                throw new ForbiddenException(t('server-ai:Error.ConversationBranch.files_unavailable'))
            authorizedPath.push(authorized)
        }
        const assetIds = [
            ...new Set([
                ...(anchor.fileAssetIds ?? []),
                ...authorizedPath.flatMap((message) => message.fileAssets?.map((asset) => asset.id) ?? [])
            ])
        ]
        for (const fileAssetId of assetIds) {
            await this.files.resolve({
                locator: { fileAssetId },
                authority: { kind: 'conversation', conversationId: source.id },
                operation: 'read'
            })
            await this.files.assertCanLinkToConversation(fileAssetId, target)
        }
        return { target, authorizedPath, assetIds, snapshot }
    }
}

// Include mutable checkpoint and relation data, not only the sealed message text.
// Sort relation IDs because SQL does not guarantee their hydration order.
function branchPathSnapshot(messages: ChatMessage[]): string {
    return createHash('sha256')
        .update(
            JSON.stringify(
                messages.map((message) => ({
                    ...message,
                    attachments: (message.attachments ?? []).map((file) => file.id).sort(),
                    fileAssets: (message.fileAssets ?? []).map((file) => file.id).sort()
                }))
            )
        )
        .digest('hex')
}
