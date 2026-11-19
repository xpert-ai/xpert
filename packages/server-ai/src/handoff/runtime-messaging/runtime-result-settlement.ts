// Invariants: inspect in the caller's completion snapshot; never claim, retry or launch work.
// Invocation pins the recipient, and all result revisions share one consumption key.
// A committed consumption record takes precedence over delayed transport acknowledgements.
import { EntityManager, IsNull } from 'typeorm'
import { z } from 'zod/v3'
import { AgentRuntimeDelivery, AgentRuntimeInbox } from './runtime-message.entity'

const settlementSchema = z.enum(['settled', 'pending', 'blocked', 'failed', 'unconfirmed'])
export type RuntimeResultSettlement = z.output<typeof settlementSchema>

/** Read result-consumption state for already-authorized owned invocations in the same transaction. */
export async function readRuntimeResultSettlement(
    manager: EntityManager,
    scope: { tenantId: string; organizationId?: string | null },
    invocationIds: string[]
): Promise<RuntimeResultSettlement> {
    if (!invocationIds.length) return 'settled'
    const rows = await manager
        .getRepository(AgentRuntimeDelivery)
        .createQueryBuilder('delivery')
        .leftJoin(
            AgentRuntimeInbox,
            'inbox',
            'inbox."invocationId" = delivery."invocationId" ' +
                'AND inbox."tenantId" = delivery."tenantId" AND inbox."organizationId" IS NOT DISTINCT FROM delivery."organizationId" ' +
                'AND inbox."ownerId" = delivery."ownerId" AND inbox.event->>\'kind\' = \'result\''
        )
        .select(
            `CASE
                WHEN inbox.state = 'processed' THEN 'settled'
                WHEN inbox.state = 'processing' THEN 'pending'
                WHEN inbox.state IS NOT NULL THEN inbox.state
                WHEN delivery.state = 'received' THEN 'unconfirmed'
                ELSE delivery.state
            END`,
            'state'
        )
        .distinct(true)
        .where({ tenantId: scope.tenantId, organizationId: scope.organizationId ?? IsNull() })
        .andWhere('delivery."invocationId" IN (:...invocationIds)', { invocationIds })
        .andWhere("delivery.event->>'kind' = 'result'")
        .getRawMany<unknown>()
    const states = z
        .array(z.object({ state: settlementSchema }).strict())
        .parse(rows)
        .map((row) => row.state)
    // An actionable delivery failure must remain visible even while siblings are still pending.
    return (
        (['failed', 'blocked', 'unconfirmed', 'pending'] as const).find((state) => states.includes(state)) ?? 'settled'
    )
}
