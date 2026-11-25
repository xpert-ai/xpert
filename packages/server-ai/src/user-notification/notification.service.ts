import { OutputDispatch } from './output/output-dispatch'
import { HttpException, Injectable, Logger } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { UserOrganization } from '@xpert-ai/server-core'
import { ChatConversation } from '../chat-conversation/conversation.entity'
import { DataSource } from 'typeorm'
import { createHash } from 'node:crypto'
import {
    agentOutputOriginSchema,
    actionNotificationSourceSchema,
    NotificationClient,
    NotificationSnapshot,
    UserNotification,
    scheduledNotificationOriginSchema,
    parseUserNotification
} from '@xpert-ai/contracts'
import { AnnouncementService } from '../announcement/announcement.service'
import { AssertChatConversationAccessQuery } from '../chat-conversation/queries/conversation-assert-access.query'
import { UserNotificationEntity } from './notification.entities'
import { notificationScope } from './notification.scope'
import { notificationError } from './notification.errors'
import { enqueueNotification } from './notification.outbox'
import { ActionNotificationSources } from './actions/action-notification.sources'

@Injectable()
export class UserNotificationService {
    private readonly logger = new Logger(UserNotificationService.name)
    constructor(
        private readonly database: DataSource,
        private readonly announcements: AnnouncementService,
        private readonly queries: QueryBus,
        private readonly outputs: OutputDispatch,
        private readonly actions: ActionNotificationSources
    ) {}

    async list(offset = 0, limit = 30, outputs = false, details = false, actions = false, workbenchViews = false) {
        const scope = notificationScope()
        const query = this.database
            .getRepository(UserNotificationEntity)
            .createQueryBuilder('n')
            .where('n.tenantId = :tenantId AND n.userId = :userId', scope)
            .andWhere('(n.actionState = :pending OR COALESCE(n.resolvedAt, n.createdAt) >= :since)', {
                pending: 'pending',
                since: new Date(Date.now() - 90 * 86400000)
            })
        if (!actions)
            query.andWhere('n.kind IN (:...kinds)', {
                kinds: outputs ? ['agent.completed', 'agent.output'] : ['agent.completed']
            })
        const [rows, total] = await query
            .orderBy("CASE WHEN n.actionState = 'pending' THEN 0 ELSE 1 END", 'ASC')
            .addOrderBy('n.createdAt', 'DESC')
            .addOrderBy('n.id', 'DESC')
            .skip(offset)
            .take(limit)
            .getManyAndCount()
        const items: UserNotification[] = []
        for (const row of rows) {
            const visible = await this.view(row, details)
            if (visible && supportsTarget(visible, workbenchViews)) items.push(visible)
        }
        return { items, hasMore: offset + rows.length < total, nextOffset: offset + rows.length }
    }

    async snapshot(
        client: NotificationClient,
        outputs = false,
        actions = false,
        workbenchViews = false
    ): Promise<NotificationSnapshot> {
        const [announcements, notifications] = await Promise.all([
            this.announcements.list(client, true),
            this.list(0, 30, outputs, false, actions, workbenchViews)
        ])
        const content = {
            announcements: announcements.items,
            notifications: notifications.items,
            hasMoreAnnouncements: announcements.total > announcements.items.length,
            hasMoreNotifications: notifications.hasMore,
            ...(actions ? { pendingCount: await this.pendingCount(workbenchViews) } : {})
        }
        return {
            supported: true,
            version: createHash('sha256').update(JSON.stringify(content)).digest('hex'),
            ...content
        }
    }

    async read(id: string, workbenchViews = false) {
        const scope = notificationScope()
        const row = await this.database.getRepository(UserNotificationEntity).findOneBy({ ...scope, id })
        if (
            !row ||
            (row.actionState !== 'pending' && (row.resolvedAt ?? row.createdAt).getTime() < Date.now() - 90 * 86400000)
        )
            throw notificationError('unavailable')
        const notification = row.kind === 'action.required' ? await this.view(row) : undefined
        if (notification && !supportsTarget(notification, workbenchViews)) throw notificationError('unavailable')
        const items =
            row.kind === 'agent.output'
                ? await this.outputs.view(
                      agentOutputOriginSchema.parse(row.source).deliveryId,
                      row.tenantId,
                      row.userId,
                      true
                  )
                : undefined
        if (items ? !items.length : !(notification ?? (await this.view(row)))) throw notificationError('unavailable')
        await this.database.transaction(async (manager) => {
            await manager
                .createQueryBuilder()
                .update(UserNotificationEntity)
                .set({ readAt: new Date() })
                .where('id = :id AND "tenantId" = :tenantId AND "userId" = :userId AND "readAt" IS NULL', {
                    id,
                    ...scope
                })
                .execute()
            await enqueueNotification(manager, scope.tenantId, scope.userId, `read:${id}`, { type: 'changed' })
        })
        // A task-result acknowledgement does not advance the conversation's message-read cursor.
        return items ? { read: true, items } : { read: true, ...(notification ? { notification } : {}) }
    }

    private async pendingCount(workbenchViews: boolean) {
        const rows = await this.database
            .getRepository(UserNotificationEntity)
            .findBy({ ...notificationScope(), actionState: 'pending' })
        let count = 0
        for (const row of rows) {
            const visible = await this.view(row)
            if (
                visible?.kind === 'action.required' &&
                visible.presentation.state === 'pending' &&
                supportsTarget(visible, workbenchViews)
            )
                count++
        }
        return count
    }

    private async view(row: UserNotificationEntity, details = false): Promise<UserNotification | null> {
        if (row.kind === 'action.required') {
            try {
                const source = actionNotificationSourceSchema.parse(row.source)
                const presentation = await this.actions.resolve(
                    { tenantId: row.tenantId, userId: row.userId },
                    {
                        type: 'action',
                        provider: source.provider,
                        key: source.key,
                        version: source.version
                    }
                )
                return presentation
                    ? parseUserNotification({
                          id: row.id,
                          kind: row.kind,
                          source,
                          presentation,
                          action: null,
                          createdAt: row.createdAt.toISOString(),
                          readAt: row.readAt?.toISOString() ?? null
                      })
                    : null
            } catch {
                // A presentation failure must not hide other notifications or settle the source action.
                // Do not log provider errors: they may contain business payloads or credentials.
                this.logger.warn(`Action notification ${row.id} is temporarily unavailable`)
                return null
            }
        }
        if (row.kind === 'agent.output') {
            const source = agentOutputOriginSchema.parse(row.source)
            const items = await this.outputs.view(source.deliveryId, row.tenantId, row.userId, details)
            return items.length
                ? parseUserNotification({
                      id: row.id,
                      kind: row.kind,
                      source,
                      titles: items.map((i) => i.title),
                      ...(details ? { items } : {}),
                      action: items.length === 1 ? items[0].action : null,
                      createdAt: row.createdAt.toISOString(),
                      readAt: row.readAt?.toISOString() ?? null
                  })
                : null
        }
        const { threadId, ...source } = scheduledNotificationOriginSchema.parse(row.source)
        const scope = notificationScope()
        try {
            const conversation: ChatConversation = await this.queries.execute(
                new AssertChatConversationAccessQuery({
                    id: source.conversationId,
                    tenantId: scope.tenantId,
                    ...(threadId ? { threadId, xpertId: source.assistantId } : { createdById: scope.userId })
                })
            )
            if (
                conversation.organizationId &&
                !(await this.database.getRepository(UserOrganization).existsBy({
                    tenantId: scope.tenantId,
                    userId: scope.userId,
                    organizationId: conversation.organizationId,
                    isActive: true
                }))
            )
                return null
            return parseUserNotification({
                id: row.id,
                kind: row.kind,
                source,
                createdAt: row.createdAt.toISOString(),
                readAt: row.readAt?.toISOString() ?? null,
                action: {
                    type: 'open_conversation',
                    assistantId: source.assistantId,
                    conversationId: source.conversationId,
                    threadId: threadId ?? conversation.threadId ?? null
                }
            })
        } catch (error) {
            if (error instanceof HttpException && [403, 404].includes(error.getStatus())) return null
            throw error
        }
    }
}

// A legacy client must not receive a target its schema cannot parse, including in the count.
function supportsTarget(notification: UserNotification, workbenchViews: boolean) {
    return (
        workbenchViews ||
        notification.kind !== 'action.required' ||
        notification.presentation.workbench.target === 'project.pipelines'
    )
}
