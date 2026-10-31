// Business state and this durable intent must share the caller's transaction.
import { EntityManager } from 'typeorm'
import type { NotificationOutboxPayload } from '@xpert-ai/contracts'
import { NotificationOutbox } from './notification.entities'

export async function enqueueNotification(
    manager: EntityManager,
    tenantId: string,
    userId: string | null,
    eventKey: string,
    payload: NotificationOutboxPayload,
    availableAt = new Date()
) {
    await manager
        .createQueryBuilder()
        .insert()
        .into(NotificationOutbox)
        .values({
            tenantId,
            userId,
            eventKey,
            payload,
            availableAt,
            state: 'pending',
            attempts: 0
        })
        .orIgnore()
        .execute()
}
