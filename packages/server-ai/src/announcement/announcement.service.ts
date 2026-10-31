import { z } from 'zod/v3'
import { Injectable } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { DataSource, EntityManager } from 'typeorm'
import {
    Announcement,
    AnnouncementInput,
    NotificationClient,
    parseAnnouncement,
    updateAnnouncementSchema
} from '@xpert-ai/contracts'
import {
    AnnouncementAudit,
    AnnouncementDismissal,
    AnnouncementEntity
} from '../user-notification/notification.entities'
import {
    announcementManagementScope,
    notificationScope,
    NotificationScope
} from '../user-notification/notification.scope'
import { notificationError } from '../user-notification/notification.errors'
import { enqueueNotification } from '../user-notification/notification.outbox'

export function announcementView(row: AnnouncementEntity, dismissedAt: Date | null = null): Announcement {
    return parseAnnouncement({
        id: row.id,
        title: row.title,
        body: row.body,
        category: row.category,
        severity: row.severity,
        clients: row.clients,
        status: row.status,
        revision: row.revision,
        action: row.action,
        startsAt: row.startsAt.toISOString(),
        expiresAt: row.expiresAt?.toISOString() ?? null,
        createdAt: row.createdAt.toISOString(),
        dismissedAt: dismissedAt?.toISOString() ?? null
    })
}

@Injectable()
export class AnnouncementService {
    constructor(private readonly database: DataSource) {}

    async list(client: NotificationClient, pending: boolean, offset = 0, limit = 30, scope = notificationScope()) {
        const query = this.database
            .getRepository(AnnouncementEntity)
            .createQueryBuilder('a')
            .where('a.tenantId = :tenantId AND a.status = :status AND a.startsAt <= CURRENT_TIMESTAMP', {
                tenantId: scope.tenantId,
                status: 'published'
            })
            .andWhere('a.clients @> :clients::jsonb', { clients: JSON.stringify([client]) })
        if (pending)
            query
                .andWhere('(a.expiresAt IS NULL OR a.expiresAt > CURRENT_TIMESTAMP)')
                .andWhere(
                    'NOT EXISTS (SELECT 1 FROM announcement_dismissal d WHERE d."tenantId" = a."tenantId" AND d."announcementId" = a.id AND d."userId" = :userId)',
                    { userId: scope.userId }
                )
        const [rows, total] = await query
            .orderBy('a.severity', 'ASC')
            .addOrderBy('a.startsAt', 'DESC')
            .addOrderBy('a.id', 'DESC')
            .skip(offset)
            .take(limit)
            .getManyAndCount()
        const dismissals = rows.length
            ? await this.database
                  .getRepository(AnnouncementDismissal)
                  .createQueryBuilder('d')
                  .where('d.tenantId = :tenantId AND d.userId = :userId', scope)
                  .andWhere('d.announcementId IN (:...ids)', { ids: rows.map((row) => row.id) })
                  .getMany()
            : []
        return {
            items: rows.map((row) =>
                announcementView(row, dismissals.find((d) => d.announcementId === row.id)?.createdAt)
            ),
            total
        }
    }

    async get(id: string, client: NotificationClient) {
        const scope = notificationScope()
        const row = await this.database
            .getRepository(AnnouncementEntity)
            .findOneBy({ id, tenantId: scope.tenantId, status: 'published' })
        if (!row || row.startsAt > new Date() || !row.clients.includes(client)) throw notificationError('unavailable')
        const dismissal = await this.database
            .getRepository(AnnouncementDismissal)
            .findOneBy({ ...scope, announcementId: id })
        return announcementView(row, dismissal?.createdAt)
    }

    async dismiss(id: string) {
        const scope = notificationScope()
        await this.database.transaction(async (manager) => {
            const row = await manager
                .getRepository(AnnouncementEntity)
                .findOne({ where: { id, tenantId: scope.tenantId }, lock: { mode: 'pessimistic_read' } })
            if (!row || row.status === 'draft' || row.startsAt > new Date()) throw notificationError('unavailable')
            // A withdrawal or expiry during reading must not make local dismissal retry forever.
            await manager
                .createQueryBuilder()
                .insert()
                .into(AnnouncementDismissal)
                .values({ ...scope, announcementId: id })
                .orIgnore()
                .execute()
            await enqueueNotification(manager, scope.tenantId, scope.userId, `dismiss:${id}:${scope.userId}`, {
                type: 'changed'
            })
        })
        return { dismissed: true }
    }

    async adminList(offset: number, limit: number) {
        const scope = announcementManagementScope()
        const [rows, total] = await this.database.getRepository(AnnouncementEntity).findAndCount({
            where: { tenantId: scope.tenantId },
            order: { createdAt: 'DESC', id: 'DESC' },
            skip: offset,
            take: limit
        })
        return { items: rows.map((row) => announcementView(row)), total }
    }

    async create(input: AnnouncementInput) {
        const scope = announcementManagementScope()
        return this.database.transaction(async (manager) => {
            const row = manager.create(AnnouncementEntity, {
                ...input,
                id: randomUUID(),
                tenantId: scope.tenantId,
                authorId: scope.userId,
                startsAt: new Date(input.startsAt),
                expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
                status: 'draft',
                revision: 1
            })
            await manager.save(row)
            await this.audit(manager, row, scope, 'create')
            return announcementView(row)
        })
    }

    async update(id: string, input: z.output<typeof updateAnnouncementSchema>) {
        return this.mutate(id, input.revision, 'edit', (row) => {
            if (row.status === 'withdrawn') throw notificationError('conflict')
            // Published audience is immutable. Explicit new publication is required to retarget.
            if (row.status === 'published' && [...row.clients].sort().join() !== [...input.clients].sort().join())
                throw notificationError('conflict')
            Object.assign(row, input, {
                startsAt: new Date(input.startsAt),
                expiresAt: input.expiresAt ? new Date(input.expiresAt) : null
            })
        })
    }

    async publish(id: string, revision: number) {
        return this.mutate(id, revision, 'publish', (row, scope) => {
            if (row.status !== 'draft' || (row.expiresAt && row.expiresAt <= new Date()))
                throw notificationError('conflict')
            row.status = 'published'
            row.publisherId = scope.userId
        })
    }

    async withdraw(id: string, revision: number) {
        return this.mutate(id, revision, 'withdraw', (row) => {
            row.status = 'withdrawn'
        })
    }

    async auditHistory(id: string) {
        const scope = announcementManagementScope()
        return this.database
            .getRepository(AnnouncementAudit)
            .find({ where: { tenantId: scope.tenantId, announcementId: id }, order: { revision: 'DESC' }, take: 100 })
    }

    private async mutate(
        id: string,
        revision: number,
        operation: AnnouncementAudit['operation'],
        apply: (row: AnnouncementEntity, scope: NotificationScope) => void
    ) {
        const scope = announcementManagementScope()
        return this.database.transaction(async (manager) => {
            const row = await manager
                .getRepository(AnnouncementEntity)
                .findOne({ where: { id, tenantId: scope.tenantId }, lock: { mode: 'pessimistic_write' } })
            if (!row) throw notificationError('unavailable')
            if (row.revision !== revision) throw notificationError('conflict')
            apply(row, scope)
            row.revision++
            await manager.save(row)
            await this.audit(manager, row, scope, operation)
            await enqueueNotification(manager, scope.tenantId, null, `announcement:${id}:${row.revision}`, {
                type: 'changed'
            })
            if (row.status === 'published') {
                if (row.startsAt > new Date())
                    await enqueueNotification(
                        manager,
                        scope.tenantId,
                        null,
                        `start:${id}:${row.revision}`,
                        { type: 'announcement.scheduled', announcementId: id, revision: row.revision, phase: 'start' },
                        row.startsAt
                    )
                if (row.expiresAt)
                    await enqueueNotification(
                        manager,
                        scope.tenantId,
                        null,
                        `expiry:${id}:${row.revision}`,
                        { type: 'announcement.scheduled', announcementId: id, revision: row.revision, phase: 'expiry' },
                        row.expiresAt
                    )
            }
            return announcementView(row)
        })
    }

    private async audit(
        manager: EntityManager,
        row: AnnouncementEntity,
        scope: NotificationScope,
        operation: AnnouncementAudit['operation']
    ) {
        const { title, body, category, severity, clients, startsAt, expiresAt, action } = announcementView(row)
        await manager.save(AnnouncementAudit, {
            tenantId: scope.tenantId,
            announcementId: row.id,
            actorId: scope.userId,
            operation,
            revision: row.revision,
            content: { title, body, category, severity, clients, startsAt, expiresAt, action }
        })
    }
}
