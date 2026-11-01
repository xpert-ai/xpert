// Redis is an invalidation hint. Durable rows and periodic client reconciliation repair missed hints.
import { HttpException, Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { REDIS_CLIENT, User } from '@xpert-ai/server-core'
import type { RedisClientType } from 'redis'
import { Observable, Subject } from 'rxjs'
import { z } from 'zod/v3'
import { randomUUID } from 'node:crypto'
import { DataSource } from 'typeorm'
import { NotificationScope } from './notification.scope'
import { t } from 'i18next'
import { UserType } from '@xpert-ai/contracts'

export const NOTIFICATION_CHANNEL = 'xpert:user-notifications:v1'
const hintSchema = z
    .object({ tenantId: z.string().uuid(), userId: z.string().uuid().nullable(), eventId: z.string().uuid() })
    .strict()

@Injectable()
export class NotificationRealtime implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(NotificationRealtime.name)
    private readonly hints = new Subject<z.output<typeof hintSchema>>()
    private readonly connections = new Map<string, number>()
    private subscriber: RedisClientType
    readonly metrics = { connections: 0, changes: 0, redisFailures: 0 }
    constructor(
        @Inject(REDIS_CLIENT) private readonly redis: RedisClientType,
        private readonly database: DataSource
    ) {}

    async onModuleInit() {
        this.subscriber = this.redis.duplicate()
        this.subscriber.on('error', () => {
            this.metrics.redisFailures++
        })
        try {
            await this.subscriber.connect()
            await this.subscriber.subscribe(NOTIFICATION_CHANNEL, (raw) => {
                try {
                    const result = hintSchema.safeParse(JSON.parse(raw))
                    if (result.success) {
                        this.metrics.changes++
                        this.hints.next(result.data)
                    }
                } catch {
                    /* An invalid hint never alters durable state. */
                }
            })
        } catch {
            this.logger.warn('Notification acceleration unavailable; clients will reconcile persisted state')
        }
    }

    async publish(scope: NotificationScope | { tenantId: string; userId: null }, eventId: string) {
        await this.redis.publish(NOTIFICATION_CHANNEL, JSON.stringify({ ...scope, eventId }))
    }

    activeConnections(tenantId: string) {
        let count = 0
        for (const [key, value] of this.connections) if (key.startsWith(`${tenantId}:`)) count += value
        return count
    }
    stream(scope: NotificationScope, lifetime = 60000) {
        const key = `${scope.tenantId}:${scope.userId}`
        const checkLimit = () => {
            if ((this.connections.get(key) ?? 0) >= 8)
                throw new HttpException(
                    {
                        code: 'NOTIFICATION_BUSY',
                        message: t('server-ai:Error.Notification_busy', {
                            defaultValue: 'Too many notification connections. Retry shortly.'
                        })
                    },
                    429
                )
        }
        checkLimit()
        return new Observable<{
            type: string
            data: { schemaVersion: 1; type: 'sync.required'; eventId: string } | { schemaVersion: 1; type: 'heartbeat' }
        }>((subscriber) => {
            checkLimit()
            this.connections.set(key, (this.connections.get(key) ?? 0) + 1)
            this.metrics.connections++
            let pending = false
            let checking = false
            const send = () =>
                subscriber.next({
                    type: 'change',
                    data: { schemaVersion: 1, type: 'sync.required', eventId: randomUUID() }
                })
            const hints = this.hints.subscribe((hint) => {
                if (hint.tenantId === scope.tenantId && (!hint.userId || hint.userId === scope.userId)) pending = true
            })
            // Subscribe before the initial invalidation; clients fetch authoritative snapshots afterwards.
            send()
            const coalesce = setInterval(() => {
                if (pending) {
                    pending = false
                    send()
                }
            }, 250)
            const heartbeat = setInterval(() => {
                if (checking) return
                checking = true
                void this.database
                    .getRepository(User)
                    .findOneBy({ id: scope.userId, tenantId: scope.tenantId })
                    .then((user) => {
                        if (!user || user.type === UserType.COMMUNICATION) subscriber.complete()
                        else subscriber.next({ type: 'heartbeat', data: { schemaVersion: 1, type: 'heartbeat' } })
                    })
                    .catch(() => subscriber.complete())
                    .finally(() => {
                        checking = false
                    })
            }, 25000)
            // Periodic authenticated reconnection bounds the lifetime of an expired/revoked credential.
            const expiry = setTimeout(() => subscriber.complete(), lifetime)
            return () => {
                const count = (this.connections.get(key) ?? 1) - 1
                if (count) this.connections.set(key, count)
                else this.connections.delete(key)
                this.metrics.connections--
                hints.unsubscribe()
                clearInterval(coalesce)
                clearInterval(heartbeat)
                clearTimeout(expiry)
            }
        })
    }

    async onModuleDestroy() {
        this.hints.complete()
        if (this.subscriber?.isOpen) await this.subscriber.disconnect()
    }
}
