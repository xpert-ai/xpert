// Claim, projection and broadcast acknowledgement are separate recoverable steps; no business action is replayed.
import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { DataSource, LessThan } from 'typeorm'
import { randomUUID } from 'node:crypto'
import { notificationOutboxPayloadSchema } from '@xpert-ai/contracts'
import { AnnouncementEntity, NotificationOutbox, UserNotificationEntity } from './notification.entities'
import { NotificationRealtime } from './notification.realtime'

@Injectable()
export class NotificationWorker implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(NotificationWorker.name)
    private timer: ReturnType<typeof setInterval>
    private running = false
    private lastCleanup = 0
    readonly metrics = { sent: 0, retries: 0, blocked: 0 }
    constructor(
        private readonly database: DataSource,
        private readonly realtime: NotificationRealtime
    ) {}
    onModuleInit() {
        this.timer = setInterval(
            () => void this.tick().catch(() => this.logger.warn('Notification delivery deferred')),
            1000
        )
        this.timer.unref()
    }
    onModuleDestroy() {
        clearInterval(this.timer)
    }

    async tick() {
        if (this.running) return
        this.running = true
        try {
            const claimed = await this.database.transaction(async (manager) => {
                const rows = await manager
                    .getRepository(NotificationOutbox)
                    .createQueryBuilder('o')
                    .where('o.state = :state AND o.availableAt <= CURRENT_TIMESTAMP', { state: 'pending' })
                    .andWhere('(o.leaseUntil IS NULL OR o.leaseUntil < CURRENT_TIMESTAMP)')
                    .orderBy('o.availableAt', 'ASC')
                    .take(20)
                    .setLock('pessimistic_write')
                    .setOnLocked('skip_locked')
                    .getMany()
                for (const row of rows) {
                    row.leaseId = randomUUID()
                    row.leaseUntil = new Date(Date.now() + 30000)
                    row.attempts++
                }
                return manager.save(rows)
            })
            await Promise.all(claimed.map((row) => this.deliver(row)))
            if (Date.now() - this.lastCleanup > 3600000) {
                this.lastCleanup = Date.now()
                await this.database
                    .getRepository(NotificationOutbox)
                    .delete({ state: 'sent', sentAt: LessThan(new Date(Date.now() - 7 * 86400000)) })
                await this.database
                    .getRepository(UserNotificationEntity)
                    .delete({ createdAt: LessThan(new Date(Date.now() - 90 * 86400000)) })
            }
        } finally {
            this.running = false
        }
    }

    async deliver(row: NotificationOutbox) {
        const repository = this.database.getRepository(NotificationOutbox)
        const ownership = { id: row.id, leaseId: row.leaseId, state: 'pending' as const }
        try {
            const payload = notificationOutboxPayloadSchema.parse(row.payload)
            if (payload.type === 'announcement.scheduled') {
                const announcement = await this.database
                    .getRepository(AnnouncementEntity)
                    .findOneBy({ id: payload.announcementId, tenantId: row.tenantId })
                if (
                    !announcement ||
                    announcement.status !== 'published' ||
                    announcement.revision !== payload.revision ||
                    (payload.phase === 'start' && announcement.expiresAt && announcement.expiresAt <= new Date())
                ) {
                    await repository.update(ownership, {
                        state: 'sent',
                        sentAt: new Date(),
                        leaseId: null,
                        leaseUntil: null
                    })
                    return
                }
            }
            if (payload.type === 'agent.completed' && row.userId) {
                await this.database
                    .createQueryBuilder()
                    .insert()
                    .into(UserNotificationEntity)
                    .values({
                        tenantId: row.tenantId,
                        userId: row.userId,
                        eventKey: row.eventKey,
                        kind: payload.type,
                        source: payload.source,
                        createdAt: row.createdAt
                    })
                    .orIgnore()
                    .execute()
            }
            // Re-broadcast even when the idempotent projection already exists after a crash.
            await this.realtime.publish({ tenantId: row.tenantId, userId: row.userId }, row.id)
            await repository.update(ownership, {
                state: 'sent',
                sentAt: new Date(),
                leaseId: null,
                leaseUntil: null,
                lastError: null
            })
            this.metrics.sent++
        } catch {
            const blocked = row.attempts >= 20
            await repository.update(ownership, {
                state: blocked ? 'blocked' : 'pending',
                leaseId: null,
                leaseUntil: null,
                lastError: 'DELIVERY_DEFERRED',
                availableAt: new Date(Date.now() + Math.min(300000, 1000 * 2 ** Math.min(row.attempts, 8)))
            })
            if (blocked) this.metrics.blocked++
            else this.metrics.retries++
        }
    }
}
