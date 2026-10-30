import { EntityManager } from 'typeorm'

/** Acquire before membership/source locks so admission and charges have one payer lock order. */
export async function lockModelCallBudget(manager: EntityManager, tenantId: string, userId: string) {
    if (manager.connection?.options?.type !== 'postgres') return
    await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`model-cost:${tenantId}:${userId}`])
}
