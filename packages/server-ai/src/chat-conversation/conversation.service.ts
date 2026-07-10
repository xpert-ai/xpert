import { BaseStore } from '@langchain/langgraph'
import {
    IChatConversationReadState,
    IChatConversationUnreadXpertSummary,
    IChatMessage,
    LongTermMemoryTypeEnum,
    TFile,
    TFileDirectory
} from '@xpert-ai/contracts'
import { PaginationParams, RequestContext, TenantOrganizationAwareCrudService } from '@xpert-ai/server-core'
import { InjectQueue } from '@nestjs/bull'
import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common'
import { CommandBus, QueryBus } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { Queue } from 'bull'
import { DeepPartial, Repository } from 'typeorm'
import { ChatMessageService } from '../chat-message/chat-message.service'
import { CreateCopilotStoreCommand } from '../copilot-store'
import { VOLUME_CLIENT, VolumeClient, VolumeSubtreeClient } from '../shared/volume'
import { FindAgentExecutionsQuery, XpertAgentExecutionStateQuery } from '../xpert-agent-execution/queries'
import { ChatConversation } from './conversation.entity'
import { ChatConversationReadState } from './conversation-read-state.entity'
import { ChatConversationPublicDTO } from './dto'

@Injectable()
export class ChatConversationService extends TenantOrganizationAwareCrudService<ChatConversation> {
    private readonly logger = new Logger(ChatConversationService.name)

    constructor(
        @InjectRepository(ChatConversation)
        public repository: Repository<ChatConversation>,
        @InjectRepository(ChatConversationReadState)
        private readonly readStateRepository: Repository<ChatConversationReadState>,
        private readonly messageService: ChatMessageService,
        readonly commandBus: CommandBus,
        readonly queryBus: QueryBus,
        @InjectQueue('conversation-summary') private summaryQueue: Queue,
        @Inject(VOLUME_CLIENT)
        private readonly volumeClient: VolumeClient
    ) {
        super(repository)
    }

    override async create(entity: DeepPartial<ChatConversation>, ...options: any[]): Promise<ChatConversation> {
        const conversation = await super.create(entity, ...options)
        await this.ensureInitialReadState(conversation).catch((error) => {
            this.logger.warn(
                `Unable to initialize read state for conversation ${conversation?.id ?? '(unknown)'}: ${
                    error?.message ?? error
                }`
            )
        })
        return conversation
    }

    async findAllByXpert(xpertId: string, options: PaginationParams<ChatConversation>) {
        return this.findAll({
            ...options,
            where: {
                ...(options.where ?? {}),
                xpertId
            }
        })
    }

    async getUnreadByXperts(xpertIds: string[]): Promise<IChatConversationUnreadXpertSummary[]> {
        const normalizedXpertIds = Array.from(
            new Set(
                (xpertIds ?? [])
                    .filter((id): id is string => typeof id === 'string' && !!id.trim())
                    .map((id) => id.trim())
            )
        )
        const tenantId = RequestContext.currentTenantId()
        const organizationId = RequestContext.getOrganizationId()
        const userId = RequestContext.currentUserId()

        if (!tenantId || !userId || normalizedXpertIds.length === 0) {
            return []
        }

        const params: unknown[] = [tenantId, userId]
        let conversationOrganizationClause = `c."organizationId" IS NULL`
        let readStateOrganizationClause = `rs."organizationId" IS NULL`
        if (organizationId) {
            params.push(organizationId)
            const organizationParam = `$${params.length}`
            conversationOrganizationClause = `c."organizationId" = ${organizationParam}`
            readStateOrganizationClause = `rs."organizationId" = ${organizationParam}`
        }
        const xpertPlaceholders = normalizedXpertIds.map((id) => {
            params.push(id)
            return `$${params.length}`
        })

        const rows = (await this.repository.query(
            `
                WITH scoped_conversations AS (
                    SELECT
                        c.id,
                        c."threadId",
                        c."xpertId",
                        c.title,
                        c."createdAt",
                        c."updatedAt"
                    FROM chat_conversation c
                    WHERE
                        c."tenantId" = $1
                        AND ${conversationOrganizationClause}
                        AND c."createdById" = $2
                        AND c."xpertId" IN (${xpertPlaceholders.join(', ')})
                ),
                latest_read_state AS (
                    SELECT DISTINCT ON (rs."conversationId")
                        rs."conversationId",
                        rs."lastReadAt",
                        rs."lastReadMessageId"
                    FROM chat_conversation_read_state rs
                    INNER JOIN scoped_conversations c
                        ON c.id = rs."conversationId"
                    WHERE
                        rs."tenantId" = $1
                        AND ${readStateOrganizationClause}
                        AND rs."userId" = $2
                    ORDER BY
                        rs."conversationId",
                        rs."lastReadAt" DESC NULLS LAST,
                        rs."updatedAt" DESC NULLS LAST,
                        rs.id DESC
                ),
                conversation_cursors AS (
                    SELECT
                        c.id,
                        c."threadId",
                        c."xpertId",
                        COALESCE(read_cursor."createdAt", rs."lastReadAt", c."updatedAt", c."createdAt") AS "cursorAt"
                    FROM scoped_conversations c
                    LEFT JOIN latest_read_state rs
                        ON rs."conversationId" = c.id
                    LEFT JOIN chat_message read_cursor
                        ON read_cursor.id::text = rs."lastReadMessageId"
                        AND read_cursor."conversationId" = c.id
                        AND read_cursor."deletedAt" IS NULL
                ),
                unread_messages AS (
                    SELECT
                        c."xpertId",
                        c.id AS "conversationId",
                        c."threadId",
                        m.id AS "messageId",
                        m."createdAt"
                    FROM conversation_cursors c
                    CROSS JOIN LATERAL (
                        SELECT
                            m.id,
                            m."createdAt"
                        FROM chat_message m
                        WHERE
                            m."conversationId" = c.id
                            AND m.role = 'ai'
                            AND m."deletedAt" IS NULL
                            AND m."createdAt" > c."cursorAt"
                    ) m
                ),
                counts AS (
                    SELECT
                        "xpertId",
                        COUNT("messageId")::int AS "unreadMessages",
                        COUNT(DISTINCT "conversationId")::int AS "unreadConversations"
                    FROM unread_messages
                    GROUP BY "xpertId"
                ),
                latest AS (
                    SELECT DISTINCT ON ("xpertId")
                        "xpertId",
                        "createdAt" AS "latestUnreadAt",
                        "conversationId" AS "latestUnreadConversationId",
                        "threadId" AS "latestUnreadThreadId"
                    FROM unread_messages
                    ORDER BY "xpertId", "createdAt" DESC, "messageId" DESC
                ),
                latest_conversations AS (
                    SELECT DISTINCT ON ("xpertId")
                        "xpertId",
                        id AS "latestConversationId",
                        "threadId" AS "latestConversationThreadId",
                        NULLIF(BTRIM(title), '') AS "latestConversationTitle",
                        COALESCE("updatedAt", "createdAt") AS "latestConversationAt"
                    FROM scoped_conversations
                    ORDER BY
                        "xpertId",
                        "updatedAt" DESC NULLS LAST,
                        "createdAt" DESC NULLS LAST,
                        id DESC
                )
                SELECT
                    latest_conversations."xpertId" AS "xpertId",
                    COALESCE(counts."unreadMessages", 0) AS "unreadMessages",
                    COALESCE(counts."unreadConversations", 0) AS "unreadConversations",
                    latest."latestUnreadAt" AS "latestUnreadAt",
                    latest."latestUnreadConversationId" AS "latestUnreadConversationId",
                    latest."latestUnreadThreadId" AS "latestUnreadThreadId",
                    latest_conversations."latestConversationAt" AS "latestConversationAt",
                    latest_conversations."latestConversationId" AS "latestConversationId",
                    latest_conversations."latestConversationThreadId" AS "latestConversationThreadId",
                    latest_conversations."latestConversationTitle" AS "latestConversationTitle"
                FROM latest_conversations
                LEFT JOIN counts
                    ON counts."xpertId" = latest_conversations."xpertId"
                LEFT JOIN latest
                    ON latest."xpertId" = latest_conversations."xpertId"
            `,
            params
        )) as Array<{
            xpertId: string
            unreadMessages: string | number
            unreadConversations: string | number
            latestUnreadAt?: Date | string | null
            latestUnreadConversationId?: string | null
            latestUnreadThreadId?: string | null
            latestConversationAt?: Date | string | null
            latestConversationId?: string | null
            latestConversationThreadId?: string | null
            latestConversationTitle?: string | null
        }>

        return rows.map((row) => ({
            xpertId: row.xpertId,
            unreadMessages: Number(row.unreadMessages) || 0,
            unreadConversations: Number(row.unreadConversations) || 0,
            latestUnreadAt: row.latestUnreadAt ?? null,
            latestUnreadConversationId: row.latestUnreadConversationId ?? null,
            latestUnreadThreadId: row.latestUnreadThreadId ?? null,
            latestConversationAt: row.latestConversationAt ?? null,
            latestConversationId: row.latestConversationId ?? null,
            latestConversationThreadId: row.latestConversationThreadId ?? null,
            latestConversationTitle: row.latestConversationTitle ?? null
        }))
    }

    async markRead(conversationId: string, lastReadMessageId?: string | null): Promise<IChatConversationReadState> {
        const userId = RequestContext.currentUserId()
        if (!userId) {
            throw new BadRequestException('User is required to update conversation read state')
        }

        const conversation = await this.findOneByOptions({
            where: {
                id: conversationId,
                createdById: userId
            } as any
        })
        if (!conversation?.id) {
            throw new BadRequestException('Conversation is required to update read state')
        }

        const lastReadMessage = await this.resolveLastReadMessage(conversation.id, lastReadMessageId)
        const lastReadAt = this.normalizeReadAt(
            lastReadMessage?.createdAt ?? conversation.updatedAt ?? conversation.createdAt
        )

        return this.saveConversationReadState(conversation, userId, lastReadAt, lastReadMessage?.id ?? null)
    }

    async findOneByThreadId(threadId: string) {
        return this.findOneByOptions({
            where: {
                threadId
            }
        })
    }

    async findOneDetail(id: string, options: DeepPartial<PaginationParams<ChatConversation>>) {
        // Split executions relation
        const { relations } = options ?? {}
        const entity = await this.findOne(id, {
            ...(options ?? {}),
            relations: relations?.filter((_) => _ !== 'executions')
        })

        let executions = null
        if (relations?.includes('executions')) {
            const result = await this.queryBus.execute(
                new FindAgentExecutionsQuery({ where: { threadId: entity.threadId } })
            )
            executions = result.items
        }

        return new ChatConversationPublicDTO({
            ...entity,
            executions
        })
    }

    async triggerSummary(conversationId: string, type: LongTermMemoryTypeEnum, userId: string, messageId?: string) {
        let message: IChatMessage = null
        if (messageId) {
            message = await this.messageService.findOne(messageId)
        } else {
            const conversation = await this.findOne(conversationId, { relations: ['messages'] })
            if (!conversation.messages.length) {
                return
            }
            message = conversation.messages[conversation.messages.length - 1]
        }

        if (message?.summaryJob?.[type]) {
            return
        }
        return await this.summaryQueue.add({
            conversationId,
            userId,
            messageId,
            types: [type]
        })
    }

    async deleteSummary(conversationId: string, messageId: string, type: LongTermMemoryTypeEnum) {
        const conversation = await this.findOne(conversationId)
        const message = await this.messageService.findOne(messageId)
        const { tenantId, organizationId } = message
        const userId = RequestContext.currentUserId()

        const summaryJob = message.summaryJob?.[type]
        try {
            if (summaryJob?.jobId) {
                const job = await this.getJob(summaryJob.jobId)
                // cancel job
                if (job) {
                    await job.discard()
                    await job.moveToFailed({ message: 'Job stopped by user' }, true)
                }
            }

            if (summaryJob) {
                if (summaryJob.memoryKey) {
                    const keys = Array.isArray(summaryJob.memoryKey) ? summaryJob.memoryKey : [summaryJob.memoryKey]

                    const store = await this.commandBus.execute<CreateCopilotStoreCommand, BaseStore>(
                        new CreateCopilotStoreCommand({
                            tenantId,
                            organizationId,
                            userId
                        })
                    )

                    for await (const key of keys) {
                        await store.delete([conversation.xpertId], key)
                    }
                }

                await this.messageService.update(messageId, {
                    summaryJob: {
                        ...message.summaryJob,
                        [type]: null
                    }
                })
            }
        } catch (err) {
            this.logger.error(err)
        }
    }

    async getJob(id: number | string) {
        return await this.summaryQueue.getJob(id)
    }

    async getThreadState(id: string) {
        const conversation = await this.findOne(id, { relations: ['messages'] })
        const messages = (conversation.messages ?? []).filter(Boolean)
        const lastMessage = messages[messages.length - 1]

        if (lastMessage?.executionId) {
            return await this.queryBus.execute(new XpertAgentExecutionStateQuery(lastMessage.executionId))
        }

        return null
    }

    async getAttachments(id: string) {
        const conversation = await this.findOne(id, { relations: ['attachments'] })
        return conversation.attachments
    }

    async getWorkspaceFiles(id: string, path?: string, deepth?: number): Promise<TFileDirectory[]> {
        const conversation = await this.findOne(id)
        const { client, scopePath } = this.createWorkspaceVolumeClient(conversation)
        return client.list(scopePath, {
            path,
            deepth
        })
    }

    async readWorkspaceFile(id: string, filePath: string): Promise<TFile> {
        const conversation = await this.findOne(id)
        const { client, scopePath } = this.createWorkspaceVolumeClient(conversation)
        return client.readFile(scopePath, filePath)
    }

    async getWorkspaceFileDownload(id: string, filePath: string) {
        const conversation = await this.findOne(id)
        const { client, scopePath } = this.createWorkspaceVolumeClient(conversation)
        return client.getDownloadTarget(scopePath, filePath)
    }

    async saveWorkspaceFile(id: string, filePath: string, content: string): Promise<TFile> {
        const conversation = await this.findOne(id)
        const { client, scopePath } = this.createWorkspaceVolumeClient(conversation)
        return client.saveFile(scopePath, filePath, content)
    }

    async uploadWorkspaceFile(
        id: string,
        folderPath: string,
        file: { originalname: string; buffer: Buffer; mimetype?: string }
    ): Promise<TFile> {
        const conversation = await this.findOne(id)
        const { client, scopePath } = this.createWorkspaceVolumeClient(conversation)
        return client.uploadFile(scopePath, folderPath, file)
    }

    async deleteWorkspaceFile(id: string, filePath: string): Promise<void> {
        const conversation = await this.findOne(id)
        const { client, scopePath } = this.createWorkspaceVolumeClient(conversation)
        await client.deleteFile(scopePath, filePath)
    }

    private createWorkspaceVolumeClient(conversation: ChatConversation) {
        const sandboxEnvironmentId = conversation.options?.sandboxEnvironmentId?.trim()
        if (sandboxEnvironmentId) {
            return {
                client: new VolumeSubtreeClient(
                    this.createEnvironmentVolumeHandle(conversation, sandboxEnvironmentId),
                    {
                        allowRootWorkspace: true
                    }
                ),
                scopePath: ''
            }
        }

        if (conversation.projectId) {
            return {
                client: new VolumeSubtreeClient(this.createProjectVolumeHandle(conversation), {
                    allowRootWorkspace: true
                }),
                scopePath: ''
            }
        }

        if (conversation.xpertId) {
            return {
                client: new VolumeSubtreeClient(this.createXpertVolumeHandle(conversation), {
                    allowRootWorkspace: true
                }),
                scopePath: ''
            }
        }

        throw new BadRequestException('Non-project conversations require xpertId to access workspace files')
    }

    private async ensureInitialReadState(conversation: ChatConversation) {
        const userId = RequestContext.currentUserId() ?? conversation?.createdById
        if (!conversation?.id || !userId) {
            return
        }

        await this.saveConversationReadState(
            conversation,
            userId,
            this.normalizeReadAt(conversation.createdAt ?? conversation.updatedAt),
            null
        )
    }

    private async resolveLastReadMessage(conversationId: string, messageId?: string | null) {
        const normalizedMessageId = typeof messageId === 'string' && messageId.trim() ? messageId.trim() : null
        if (normalizedMessageId) {
            return this.messageService.findOneByOptions({
                where: {
                    id: normalizedMessageId,
                    conversationId
                } as any
            })
        }

        const result = await this.messageService.findAll({
            where: {
                conversationId
            } as any,
            order: {
                createdAt: 'DESC',
                id: 'DESC'
            } as any,
            take: 1
        })

        return result.items?.[0] ?? null
    }

    private async saveConversationReadState(
        conversation: ChatConversation,
        userId: string,
        lastReadAt: Date,
        lastReadMessageId: string | null
    ) {
        if (!conversation.id) {
            throw new BadRequestException('Conversation id is required to update read state')
        }

        const conversationId = conversation.id
        const tenantId = conversation.tenantId ?? RequestContext.currentTenantId()
        const organizationId = conversation.organizationId ?? null
        const rows = await this.upsertConversationReadState(
            tenantId,
            organizationId,
            conversationId,
            userId,
            lastReadAt,
            lastReadMessageId
        )
        const row = rows[0]

        if (!row) {
            throw new BadRequestException('Conversation read state could not be updated')
        }

        return this.readStateRepository.create({
            ...row,
            lastReadAt: this.normalizeReadAt(row.lastReadAt)
        })
    }

    private upsertConversationReadState(
        tenantId: string,
        organizationId: string | null,
        conversationId: string,
        userId: string,
        lastReadAt: Date,
        lastReadMessageId: string | null
    ): Promise<
        Array<{
            id?: string
            tenantId?: string | null
            organizationId?: string | null
            conversationId: string
            userId: string
            lastReadAt: Date | string
            lastReadMessageId?: string | null
            createdAt?: Date | string
            updatedAt?: Date | string
        }>
    > {
        const params = [tenantId, organizationId, conversationId, userId, lastReadAt, lastReadMessageId]
        if (!organizationId) {
            return this.readStateRepository.manager.transaction(async (manager) => {
                await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))`, [
                    tenantId,
                    `${conversationId}:${userId}`
                ])

                return manager.query(
                    `
                        WITH latest AS (
                            SELECT rs.id
                            FROM chat_conversation_read_state rs
                            WHERE
                                rs."tenantId" = $1
                                AND rs."organizationId" IS NULL
                                AND rs."conversationId" = $3
                                AND rs."userId" = $4
                            ORDER BY
                                rs."lastReadAt" DESC NULLS LAST,
                                rs."updatedAt" DESC NULLS LAST,
                                rs.id DESC
                            LIMIT 1
                        ),
                        updated AS (
                            UPDATE chat_conversation_read_state rs
                            SET
                                "lastReadAt" = $5,
                                "lastReadMessageId" = $6,
                                "updatedAt" = NOW()
                            FROM latest
                            WHERE rs.id = latest.id
                            RETURNING
                                rs.id,
                                rs."tenantId",
                                rs."organizationId",
                                rs."conversationId",
                                rs."userId",
                                rs."lastReadAt",
                                rs."lastReadMessageId",
                                rs."createdAt",
                                rs."updatedAt"
                        ),
                        inserted AS (
                            INSERT INTO chat_conversation_read_state (
                                "tenantId",
                                "organizationId",
                                "conversationId",
                                "userId",
                                "lastReadAt",
                                "lastReadMessageId",
                                "createdAt",
                                "updatedAt"
                            )
                            SELECT $1, NULL, $3, $4, $5, $6, NOW(), NOW()
                            WHERE NOT EXISTS (SELECT 1 FROM updated)
                            RETURNING
                                id,
                                "tenantId",
                                "organizationId",
                                "conversationId",
                                "userId",
                                "lastReadAt",
                                "lastReadMessageId",
                                "createdAt",
                                "updatedAt"
                        )
                        SELECT * FROM updated
                        UNION ALL
                        SELECT * FROM inserted
                        LIMIT 1
                    `,
                    params
                )
            })
        }

        return this.readStateRepository.query(
            `
                INSERT INTO chat_conversation_read_state (
                    "tenantId",
                    "organizationId",
                    "conversationId",
                    "userId",
                    "lastReadAt",
                    "lastReadMessageId",
                    "createdAt",
                    "updatedAt"
                )
                VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
                ON CONFLICT ("tenantId", "organizationId", "conversationId", "userId")
                DO UPDATE SET
                    "lastReadAt" = EXCLUDED."lastReadAt",
                    "lastReadMessageId" = EXCLUDED."lastReadMessageId",
                    "updatedAt" = NOW()
                RETURNING
                    id,
                    "tenantId",
                    "organizationId",
                    "conversationId",
                    "userId",
                    "lastReadAt",
                    "lastReadMessageId",
                    "createdAt",
                    "updatedAt"
            `,
            params
        )
    }

    private normalizeReadAt(value: Date | string | null | undefined) {
        if (!value) {
            return new Date()
        }

        return value instanceof Date ? value : new Date(value)
    }

    private createEnvironmentVolumeHandle(conversation: ChatConversation, sandboxEnvironmentId: string) {
        return this.volumeClient.resolve({
            tenantId: conversation.tenantId,
            catalog: 'environment',
            environmentId: sandboxEnvironmentId,
            userId: conversation.createdById
        })
    }

    private createProjectVolumeHandle(conversation: ChatConversation) {
        return this.volumeClient.resolve({
            tenantId: conversation.tenantId,
            catalog: 'projects',
            projectId: conversation.projectId,
            userId: conversation.createdById
        })
    }

    private createXpertVolumeHandle(conversation: ChatConversation) {
        return this.volumeClient.resolve({
            tenantId: conversation.tenantId,
            catalog: 'xperts',
            userId: conversation.createdById,
            xpertId: conversation.xpertId,
            isolateByUser: false
        })
    }
}
