import { HttpException, Injectable } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import { UserOrganization } from '@xpert-ai/server-core'
import { ChatConversation } from '../chat-conversation/conversation.entity'
import { DataSource, MoreThanOrEqual } from 'typeorm'
import { createHash } from 'node:crypto'
import {
    NotificationClient,
    NotificationSnapshot,
    UserNotification,
    notificationSourceSchema,
    parseUserNotification
} from '@xpert-ai/contracts'
import { AnnouncementService } from '../announcement/announcement.service'
import { AssertChatConversationAccessQuery } from '../chat-conversation/queries/conversation-assert-access.query'
import { UserNotificationEntity } from './notification.entities'
import { notificationScope } from './notification.scope'
import { notificationError } from './notification.errors'
import { enqueueNotification } from './notification.outbox'

@Injectable()
export class UserNotificationService {
    constructor(
        private readonly database: DataSource,
        private readonly announcements: AnnouncementService,
        private readonly queries: QueryBus
    ) {}

    async list(offset = 0, limit = 30) {
        const scope = notificationScope()
        const [rows, total] = await this.database.getRepository(UserNotificationEntity).findAndCount({
            where: { ...scope, createdAt: MoreThanOrEqual(new Date(Date.now() - 90 * 86400000)) },
            order: { createdAt: 'DESC', id: 'DESC' },
            skip: offset,
            take: limit
        })
        const items: UserNotification[] = []
        for (const row of rows) {
            const visible = await this.view(row)
            if (visible) items.push(visible)
        }
        return { items, hasMore: offset + rows.length < total, nextOffset: offset + rows.length }
    }

    async snapshot(client: NotificationClient): Promise<NotificationSnapshot> {
        const [announcements, notifications] = await Promise.all([this.announcements.list(client, true), this.list()])
        const content = {
            announcements: announcements.items,
            notifications: notifications.items,
            hasMoreAnnouncements: announcements.total > announcements.items.length,
            hasMoreNotifications: notifications.hasMore
        }
        return {
            supported: true,
            version: createHash('sha256').update(JSON.stringify(content)).digest('hex'),
            ...content
        }
    }

    async read(id: string) {
        const scope = notificationScope()
        const row = await this.database
            .getRepository(UserNotificationEntity)
            .findOneBy({ ...scope, id, createdAt: MoreThanOrEqual(new Date(Date.now() - 90 * 86400000)) })
        if (!row || !(await this.view(row))) throw notificationError('unavailable')
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
        return { read: true }
    }

    private async view(row: UserNotificationEntity): Promise<UserNotification | null> {
        const source = notificationSourceSchema.parse(row.source)
        const scope = notificationScope()
        try {
            const conversation: ChatConversation = await this.queries.execute(
                new AssertChatConversationAccessQuery({
                    id: source.conversationId,
                    tenantId: scope.tenantId,
                    createdById: scope.userId
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
                    threadId: conversation.threadId ?? null
                }
            })
        } catch (error) {
            if (error instanceof HttpException && [403, 404].includes(error.getStatus())) return null
            throw error
        }
    }
}
