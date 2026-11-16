import { Injectable } from '@nestjs/common'
import { createHash, randomUUID } from 'node:crypto'
import { DataSource } from 'typeorm'
import {
    agentEventDecisionSchema,
    pluginAgentEventSchema,
    type EventDecision,
    type EventPublishResult,
    type PluginAgentEvent,
    type PluginAgentEventSource
} from '@xpert-ai/plugin-sdk'
import type { AgentEventBinding } from './agent-event.entity'

const maxAttempts = 10

export interface EventClaim {
    partition: string
    owner: string
    fence: string
    receiptId: string
    event: PluginAgentEvent
}

@Injectable()
export class AgentEventStore {
    constructor(private readonly db: DataSource) {}

    async publish(
        binding: AgentEventBinding,
        source: PluginAgentEventSource,
        input: PluginAgentEvent
    ): Promise<EventPublishResult> {
        const parsed = pluginAgentEventSchema.safeParse(input)
        if (!parsed.success) return { status: 'rejected', code: 'invalid_event' }
        const event = parsed.data
        const fingerprint = createHash('sha256').update(JSON.stringify(event)).digest('hex')
        return this.db.transaction(async (tx) => {
            const [current] = await tx.query<Pick<AgentEventBinding, 'state' | 'revision'>[]>(
                'SELECT state, revision FROM agent_event_binding WHERE id=$1 AND "tenantId"=$2 AND "organizationId"=$3 FOR SHARE',
                [binding.id, binding.tenantId, binding.organizationId]
            )
            if (!current || current.state !== 'enabled' || current.revision !== binding.revision)
                return { status: 'rejected', code: 'binding_changed' }
            const params = [binding.id, event.sourceEventId]
            const match = async (): Promise<EventPublishResult | undefined> => {
                const [row] = await tx.query<{ id: string; fingerprint: string }[]>(
                    'SELECT id,fingerprint FROM agent_event_inbox WHERE binding=$1 AND "sourceEventId"=$2',
                    params
                )
                if (!row) return
                if (row.fingerprint === fingerprint) return { status: 'duplicate', receiptId: row.id }
                await tx.query(
                    'UPDATE agent_event_inbox SET "conflictCount"="conflictCount"+1,"updatedAt"=now(),"updatedById"=NULL WHERE id=$1',
                    [row.id]
                )
                return { status: 'rejected', code: 'identity_conflict' }
            }
            const previous = await match()
            if (previous) return previous
            if (event.bindingRevision !== current.revision) return { status: 'rejected', code: 'binding_changed' }
            if (!source.eventTypes.some((t) => t.type === event.type && t.schemaVersion === event.schemaVersion))
                return { status: 'rejected', code: 'unsupported_version' }
            const [partition] = await tx.query<{ id: string }[]>(
                `
                INSERT INTO agent_event_partition(binding,kind,subject,"tenantId","organizationId") VALUES ($1,$2,$3,$4,$5)
                ON CONFLICT(binding,kind,subject) DO UPDATE SET subject=EXCLUDED.subject RETURNING id`,
                [binding.id, event.subject.kind, event.subject.key, binding.tenantId, binding.organizationId]
            )
            const [row] = await tx.query<{ id: string }[]>(
                `
                INSERT INTO agent_event_inbox(binding,partition,"sourceEventId",event,fingerprint,"tenantId","organizationId")
                VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(binding,"sourceEventId") DO NOTHING RETURNING id`,
                [
                    binding.id,
                    partition.id,
                    event.sourceEventId,
                    event,
                    fingerprint,
                    binding.tenantId,
                    binding.organizationId
                ]
            )
            if (row) return { status: 'accepted', receiptId: row.id }
            const raced = await match()
            if (!raced) throw new Error('Event receipt missing after conflict')
            return raced
        })
    }

    async claim(binding: AgentEventBinding): Promise<EventClaim | undefined> {
        return this.db.transaction(async (tx) => {
            const [current] = await tx.query<Pick<AgentEventBinding, 'state' | 'revision'>[]>(
                'SELECT state, revision FROM agent_event_binding WHERE id=$1 AND "tenantId"=$2 AND "organizationId"=$3 FOR SHARE',
                [binding.id, binding.tenantId, binding.organizationId]
            )
            if (current?.state !== 'enabled' || current.revision !== binding.revision) return
            const [partition] = await tx.query<{ id: string }[]>(
                `SELECT p.id FROM agent_event_partition p
                CROSS JOIN LATERAL (SELECT seq,due FROM agent_event_inbox i WHERE i.partition=p.id
                    AND i.state IN ('pending','processing','retry_wait') ORDER BY seq LIMIT 1) head
                WHERE p.binding=$1 AND (p.expires IS NULL OR p.expires<=now()) AND head.due<=now()
                ORDER BY head.seq LIMIT 1 FOR UPDATE OF p SKIP LOCKED`,
                [binding.id]
            )
            if (!partition) return
            // After locking the partition, take a fresh snapshot. Another worker may have advanced its head.
            const [, isolated] = await tx.query(
                `UPDATE agent_event_inbox SET state='isolated',error='lease_expired',"updatedAt"=now(),"updatedById"=NULL
                WHERE partition=$1 AND state='processing' AND attempt >= $2`,
                [partition.id, maxAttempts]
            )
            const [row] = await tx.query<{ id: string; event: PluginAgentEvent }[]>(
                `SELECT id,event FROM (SELECT id,event,due FROM agent_event_inbox WHERE partition=$1
                    AND state IN ('pending','processing','retry_wait') ORDER BY seq LIMIT 1) head WHERE due<=now()`,
                [partition.id]
            )
            if (!row) {
                if (isolated)
                    await tx.query(
                        'UPDATE agent_event_partition SET owner=NULL,expires=NULL,"updatedAt"=now(),"updatedById"=NULL WHERE id=$1',
                        [partition.id]
                    )
                return
            }
            const owner = randomUUID()
            const [[lease]] = await tx.query(
                `UPDATE agent_event_partition SET owner=$2,fence=fence+1,"updatedAt"=now(),"updatedById"=NULL,
                expires=now()+interval '60 seconds' WHERE id=$1 RETURNING fence::text`,
                [partition.id, owner]
            )
            await tx.query(
                'UPDATE agent_event_inbox SET state=\'processing\',attempt=attempt+1,"updatedAt"=now(),"updatedById"=NULL WHERE id=$1',
                [row.id]
            )
            return { receiptId: row.id, partition: partition.id, owner, fence: String(lease.fence), event: row.event }
        })
    }

    async complete(claim: EventClaim, decision?: EventDecision, waitForThread = false) {
        const result = decision ? agentEventDecisionSchema.parse(decision) : null
        return this.db.transaction(async (tx) => {
            const [valid] = await tx.query(
                `SELECT id FROM agent_event_partition
                WHERE id=$1 AND owner=$2 AND fence=$3 AND expires>now() FOR UPDATE`,
                [claim.partition, claim.owner, claim.fence]
            )
            if (!valid) return false
            const [, updated] = await tx.query(
                `UPDATE agent_event_inbox SET state=COALESCE($2,CASE WHEN NOT $7 AND attempt>=$6 THEN 'isolated' ELSE 'retry_wait' END),
                attempt=CASE WHEN $7 THEN greatest(0,attempt-1) ELSE attempt END,
                due=now()+(CASE WHEN $7 THEN 30 ELSE least(300,power(2,least(attempt,8))) END) * interval '1 second',
                decision=$3,error=$4,"updatedAt"=now(),"updatedById"=NULL WHERE id=$1 AND partition=$5 AND state='processing'`,
                [
                    claim.receiptId,
                    result?.status ?? null,
                    result,
                    result
                        ? result.status === 'handled'
                            ? null
                            : result.reasonCode
                        : waitForThread
                          ? 'thread_busy'
                          : 'source_unavailable',
                    claim.partition,
                    maxAttempts,
                    waitForThread
                ]
            )
            if (!updated) return false
            await tx.query(
                'UPDATE agent_event_partition SET owner=NULL,expires=NULL,"updatedAt"=now(),"updatedById"=NULL WHERE id=$1',
                [claim.partition]
            )
            return true
        })
    }
}
