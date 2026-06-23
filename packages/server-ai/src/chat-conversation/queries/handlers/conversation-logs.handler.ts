import { TChatConversationLog } from '@xpert-ai/contracts'
import { User } from '@xpert-ai/server-core'
import { IQueryHandler, QueryHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import {
    Brackets,
    FindManyOptions,
    FindOptionsRelationByString,
    FindOptionsWhere,
    In,
    Repository,
    SelectQueryBuilder
} from 'typeorm'
import { ChatConversation } from '../../conversation.entity'
import { ChatConversationService } from '../../conversation.service'
import { ChatConversationLogsQuery } from '../conversation-logs.query'

@QueryHandler(ChatConversationLogsQuery)
export class ChatConversationLogsHandler implements IQueryHandler<
    ChatConversationLogsQuery,
    { items: TChatConversationLog[]; total: number }
> {
    constructor(
        @InjectRepository(ChatConversation)
        public repository: Repository<ChatConversation>,
        private readonly service: ChatConversationService
    ) {}

    public async execute(command: ChatConversationLogsQuery) {
        const { where, skip, take, order } = command.options
        const relations = (command.options.relations ?? []) as FindOptionsRelationByString
        const search = command.search?.trim()

        const repository = this.repository
        const entityRelations = relations.filter((_) => _ !== 'messages')
        const pageIdsQuery = repository.createQueryBuilder('conversation').select('conversation.id').where(where)
        applyConversationLogSearch(pageIdsQuery, search)
        applyConversationLogOrder(pageIdsQuery, order)

        if (typeof skip === 'number') {
            pageIdsQuery.offset(skip)
        }

        if (typeof take === 'number') {
            pageIdsQuery.limit(take)
        }

        const countQuery = repository.createQueryBuilder('conversation').where(where)
        applyConversationLogSearch(countQuery, search)

        const [pageResult, total] = await Promise.all([pageIdsQuery.getRawAndEntities(), countQuery.getCount()])
        const pageIds = readPageConversationIds(pageResult.entities, pageResult.raw)

        if (!pageIds.length) {
            return {
                items: [],
                total
            }
        }

        const findOptions: FindManyOptions<ChatConversation> = {
            where: {
                id: In(pageIds)
            } as FindOptionsWhere<ChatConversation>
        }
        if (entityRelations.length) {
            findOptions.relations = entityRelations
        }

        const [entities, supplementsByConversationId] = await Promise.all([
            repository.find(findOptions),
            loadConversationLogSupplements(repository, pageIds)
        ])
        await mapConversationFromEndUsers(repository, entities)
        const entitiesById = new Map(entities.map((entity) => [entity.id, entity]))

        return {
            items: pageIds
                .map((id) => entitiesById.get(id))
                .filter((item): item is ChatConversation => !!item)
                .map((item) => ({
                    ...(item as unknown as TChatConversationLog),
                    ...supplementsByConversationId.get(item.id),
                    ...conversationSourceAuditLogFields(item)
                })),
            total
        }
    }
}

function applyConversationLogSearch(query: SelectQueryBuilder<ChatConversation>, search?: string) {
    if (!search) {
        return
    }

    query.leftJoin('conversation.createdBy', 'createdBy').andWhere(
        new Brackets((qb) => {
            qb.where('conversation.title ILIKE :search', { search: `%${search}%` })
                .orWhere('CAST(conversation.id AS text) ILIKE :search', { search: `%${search}%` })
                .orWhere('conversation.threadId ILIKE :search', { search: `%${search}%` })
                .orWhere('conversation.fromEndUserId ILIKE :search', { search: `%${search}%` })
                .orWhere('createdBy.firstName ILIKE :search', { search: `%${search}%` })
                .orWhere('createdBy.lastName ILIKE :search', { search: `%${search}%` })
                .orWhere('createdBy.username ILIKE :search', { search: `%${search}%` })
                .orWhere('createdBy.email ILIKE :search', { search: `%${search}%` })
        })
    )
}

function applyConversationLogOrder(
    query: SelectQueryBuilder<ChatConversation>,
    order: Record<string, unknown> | undefined
) {
    if (!order) {
        return
    }

    Object.entries(order).forEach(([name, order]) => {
        query.orderBy(`conversation.${name}`, order as 'ASC' | 'DESC')
    })
}

type ConversationLogSupplement = Partial<TChatConversationLog> & {
    messageCount?: number
}

function readPageConversationIds(entities: ChatConversation[], raw: Record<string, unknown>[]) {
    const entityIds = entities.map((conversation) => conversation.id).filter(Boolean)

    if (entityIds.length) {
        return entityIds
    }

    return raw
        .map((row) => readString(row.conversation_id ?? row.id ?? row.conversationId))
        .filter((id): id is string => !!id)
}

async function loadConversationLogSupplements(
    repository: Repository<ChatConversation>,
    conversationIds: string[]
): Promise<Map<string, ConversationLogSupplement>> {
    const [messageCountRows, auditRows] = await Promise.all([
        repository.manager.query(
            `
                SELECT "conversationId"::text AS "conversationId", COUNT(*)::int AS "messageCount"
                FROM chat_message
                WHERE "conversationId" = ANY($1::uuid[])
                    AND "deletedAt" IS NULL
                GROUP BY "conversationId"
            `,
            [conversationIds]
        ),
        repository.manager.query(
            `
                SELECT DISTINCT ON (conversation.id)
                    conversation.id::text AS "conversationId",
                    COALESCE(
                        conversation."sourceAudit"->>'sourceIntegrationId',
                        execution.metadata->>'sourceIntegrationId'
                    ) AS "sourceIntegrationId",
                    COALESCE(
                        conversation."sourceAudit"->>'channelType',
                        execution.metadata->>'channelType'
                    ) AS "channelType",
                    COALESCE(
                        conversation."sourceAudit"->'sourceMessageLogIds',
                        execution.metadata->'sourceMessageLogIds'
                    ) AS "sourceMessageLogIds"
                FROM chat_conversation conversation
                LEFT JOIN xpert_agent_execution execution
                    ON execution."threadId" = conversation."threadId"
                    AND execution."xpertId" = conversation."xpertId"
                    AND execution."parentId" IS NULL
                WHERE conversation.id = ANY($1::uuid[])
                ORDER BY conversation.id, execution."createdAt" DESC NULLS LAST
            `,
            [conversationIds]
        )
    ])

    const supplementsByConversationId = new Map<string, ConversationLogSupplement>(
        conversationIds.map((conversationId) => [conversationId, { messageCount: 0 }])
    )

    for (const row of messageCountRows) {
        const conversationId = readString(row.conversationId)
        if (!conversationId) {
            continue
        }

        supplementsByConversationId.set(conversationId, {
            ...supplementsByConversationId.get(conversationId),
            messageCount: Number(row.messageCount ?? 0)
        })
    }

    for (const row of auditRows) {
        const conversationId = readString(row.conversationId)
        if (!conversationId) {
            continue
        }

        const sourceIntegrationId = readString(row.sourceIntegrationId)
        const channelType = readString(row.channelType)
        const sourceMessageLogIds = readStringList(row.sourceMessageLogIds)
        const supplement: ConversationLogSupplement = {
            ...supplementsByConversationId.get(conversationId),
            ...(sourceIntegrationId ? { sourceIntegrationId } : {}),
            ...(channelType ? { channelType } : {}),
            ...(sourceMessageLogIds.length ? { sourceMessageLogIds } : {})
        }

        supplementsByConversationId.set(conversationId, supplement)
    }

    return supplementsByConversationId
}

function conversationSourceAuditLogFields(conversation: ChatConversation): Partial<TChatConversationLog> {
    const sourceAudit = conversation.sourceAudit
    if (!sourceAudit) {
        return {}
    }

    const sourceMessageLogIds = readStringList(sourceAudit.sourceMessageLogIds)

    return {
        ...(sourceAudit.sourceIntegrationId ? { sourceIntegrationId: sourceAudit.sourceIntegrationId } : {}),
        ...(sourceAudit.channelType ? { channelType: sourceAudit.channelType } : {}),
        ...(sourceMessageLogIds.length ? { sourceMessageLogIds } : {})
    }
}

async function mapConversationFromEndUsers(
    repository: Repository<ChatConversation>,
    conversations: ChatConversation[]
) {
    const userIds = [
        ...new Set(
            conversations
                .map((conversation) => conversation.fromEndUserId)
                .filter((id): id is string => !!id && isUuid(id))
        )
    ]

    if (!userIds.length) {
        return
    }

    const users = await repository.manager.getRepository(User).find({
        where: {
            id: In(userIds)
        }
    })
    const usersById = new Map(users.map((user) => [user.id, user]))

    conversations.forEach((conversation) => {
        if (conversation.fromEndUserId) {
            ;(conversation as ChatConversation & { fromEndUser?: User | null }).fromEndUser =
                usersById.get(conversation.fromEndUserId) ?? null
        }
    })
}

function isUuid(value: string) {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length ? value : undefined
}

function readStringList(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value.filter((item): item is string => typeof item === 'string' && item.length > 0)
    }

    if (typeof value !== 'string' || !value.length) {
        return []
    }

    try {
        const parsed = JSON.parse(value)
        return Array.isArray(parsed)
            ? parsed.filter((item): item is string => typeof item === 'string' && item.length > 0)
            : []
    } catch {
        return []
    }
}
