import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { timerSource } from './follow-up-timer.constants'
import { Repository } from 'typeorm'
import { AgentEventBinding, AgentEventInbox } from './agent-event.entity'

type Actor = Pick<AgentEventBinding, 'tenantId' | 'organizationId' | 'userId'>
export type BindingChange = Pick<AgentEventBinding, 'plugin' | 'adapter' | 'sourceBindingRef'> & {
    projectId?: string
    expectedRevision: number
    enabled: boolean
}

@Injectable()
export class AgentEventBindingService {
    constructor(@InjectRepository(AgentEventBinding) private readonly bindings: Repository<AgentEventBinding>) {}

    configure(
        actor: Actor,
        target: Pick<AgentEventBinding, 'xpertId' | 'workspaceId' | 'publishedAt'>,
        input: BindingChange
    ) {
        const { tenantId, organizationId, userId } = actor
        const { plugin, adapter, sourceBindingRef } = input
        const { xpertId, publishedAt } = target
        const key = { tenantId, organizationId, xpertId, plugin, adapter, sourceBindingRef }
        return this.bindings.manager.transaction(async (tx) => {
            // Serialize first-time creation too. Keep the existing lock key across rolling deployments.
            await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
                JSON.stringify([tenantId, organizationId, xpertId, plugin, adapter, sourceBindingRef])
            ])
            const rows = tx.getRepository(AgentEventBinding)
            const old = await rows.findOne({ where: key, lock: { mode: 'pessimistic_write' } })
            if (old && old.userId !== userId) throw new ForbiddenException()
            if (old && old.projectId !== (input.projectId ?? null)) throw new ConflictException('event_project_changed')
            const state = input.enabled ? 'configuring' : 'paused'
            if (
                old &&
                old.revision === input.expectedRevision + 1 &&
                old.publishedAt.getTime() === publishedAt.getTime() &&
                (old.state === state || (input.enabled && old.state === 'enabled' && old.capture))
            )
                return old
            if ((old?.revision ?? 0) !== input.expectedRevision) throw new ConflictException('event_revision_changed')
            if (!old && !input.enabled) throw new NotFoundException()
            const binding =
                old ??
                rows.create({
                    ...key,
                    workspaceId: target.workspaceId,
                    projectId: input.projectId ?? null,
                    userId,
                    createdById: userId
                })
            if (old) binding.capture = false
            binding.state = state
            binding.revision = input.expectedRevision + 1
            binding.publishedAt = publishedAt
            binding.lastError = null
            binding.updatedById = userId
            return rows.save(binding)
        })
    }

    async updateCapture(binding: AgentEventBinding, enabled: boolean) {
        const { affected } = await this.bindings.update(
            { id: binding.id, revision: binding.revision, state: enabled ? 'configuring' : 'enabled' },
            { state: 'enabled', capture: enabled, nextScan: () => 'now()', updatedById: binding.userId }
        )
        if (!affected) throw new ConflictException('event_revision_changed')
    }

    findOwned(id: string, actor: Actor) {
        return this.bindings.findOneBy({ id, ...actor })
    }

    findEnabled(id: string, tenantId: string, organizationId: string) {
        return this.bindings.findOneBy({ id, tenantId, organizationId, state: 'enabled' })
    }

    async reserveDue() {
        const [bindings] = await this.bindings.query<[AgentEventBinding[], number]>(
            `
            UPDATE agent_event_binding SET "nextScan"=now()+interval '5 seconds', "updatedAt"=now(), "updatedById"=NULL
            WHERE id IN (SELECT b.id FROM agent_event_binding b WHERE b.state='enabled' AND b."nextScan"<=now()
                AND ((b.plugin,b.adapter) <> ($1,$2) OR EXISTS (
                    SELECT 1 FROM agent_follow_up_timer t WHERE t.binding=b.id AND t.revision=b.revision
                    AND t.state='waiting' AND t."dueAt"<=now()
                ) OR EXISTS (
                    SELECT 1 FROM agent_event_inbox i WHERE i.binding=b.id AND i.state IN ('pending','processing','retry_wait')
                ))
                ORDER BY b."nextScan",b.id LIMIT 16 FOR UPDATE SKIP LOCKED) RETURNING *`,
            [timerSource.plugin, timerSource.adapter]
        )
        return bindings
    }

    scheduleNext(binding: AgentEventBinding) {
        return this.bindings.update(
            { id: binding.id, revision: binding.revision, state: 'enabled' },
            { nextScan: () => 'now()', updatedById: null }
        )
    }

    recordScan(binding: AgentEventBinding, lastError: string | null) {
        return this.bindings.update(
            { id: binding.id, revision: binding.revision, state: 'enabled' },
            { lastScanAt: () => 'now()', lastError, updatedById: null }
        )
    }

    async revoke(binding: AgentEventBinding) {
        const { id, tenantId, organizationId, userId, revision } = binding
        await this.bindings.manager.transaction(async (tx) => {
            const { affected } = await tx.update(
                AgentEventBinding,
                { id, tenantId, organizationId, userId, revision, state: 'enabled' },
                { state: 'revoked', lastError: 'event_access_changed', lastScanAt: () => 'now()', updatedById: null }
            )
            if (!affected) return
            // Match claim's binding → partition → receipt lock order. A late completion cannot replace a block.
            await tx.query(
                `UPDATE agent_event_partition SET owner=NULL,expires=NULL,"updatedAt"=now(),"updatedById"=NULL
                 WHERE binding=$1 AND owner IS NOT NULL`,
                [id]
            )
            await tx.query(
                `UPDATE agent_event_inbox SET state='blocked',
                 decision=jsonb_build_object('status','blocked','reasonCode','event_access_changed'),
                 error='event_access_changed',"updatedAt"=now(),"updatedById"=NULL
                 WHERE binding=$1 AND state IN ('pending','processing','retry_wait')`,
                [id]
            )
        })
    }

    async retry(binding: AgentEventBinding, receiptId: string) {
        await this.bindings.manager.transaction(async (tx) => {
            const { id, tenantId, organizationId, userId, revision } = binding
            const current = await tx.findOne(AgentEventBinding, {
                select: { id: true },
                where: { id, tenantId, organizationId, userId, revision, state: 'enabled' },
                lock: { mode: 'pessimistic_read' }
            })
            if (!current) throw new ConflictException('receipt_not_retryable')
            const [, updated] = await tx.query(
                `UPDATE agent_event_inbox SET state='pending',due=now(),attempt=0,error=NULL,"updatedAt"=now(),"updatedById"=$4
                 WHERE id=$1 AND binding=$2 AND (event->>'bindingRevision')::int=$3 AND state='isolated' AND decision IS NULL`,
                [receiptId, id, revision, userId]
            )
            if (!updated) throw new ConflictException('receipt_not_retryable')
        })
    }

    async diagnostics(id: string) {
        const [counts] = await this.bindings.query(
            `
            SELECT count(*)::int AS received, coalesce(sum("conflictCount"),0)::int AS conflicts,
                min("receivedAt") FILTER (WHERE state IN ('pending','processing','retry_wait')) AS "oldestPending",
                count(*) FILTER (WHERE state='isolated')::int AS isolated FROM agent_event_inbox WHERE binding=$1`,
            [id]
        )
        return counts
    }

    async receipts(id: string, cursor: string) {
        const rows = await this.bindings.query(
            `
            SELECT id,seq::text AS cursor,"sourceEventId",event->>'type' AS type,
                state,attempt,error,decision,"receivedAt","conflictCount" FROM agent_event_inbox
            WHERE binding=$1 AND seq>$2::bigint ORDER BY seq LIMIT 51`,
            [id, cursor]
        )
        const items = rows.slice(0, 50)
        return { items, next: rows.length > 50 ? items[49].cursor : null }
    }

    findReceipt(id: string, actor: Actor) {
        return this.bindings.manager
            .getRepository(AgentEventInbox)
            .createQueryBuilder('receipt')
            .innerJoin(AgentEventBinding, 'binding', 'binding.id = receipt.binding')
            .where('receipt.id = :id', { id })
            .andWhere(
                'binding.tenantId = :tenantId AND binding.organizationId = :organizationId AND binding.userId = :userId',
                actor
            )
            .select([
                'receipt.id',
                'receipt.binding',
                'receipt.state',
                'receipt.attempt',
                'receipt.error',
                'receipt.decision',
                'receipt.receivedAt',
                'receipt.conflictCount'
            ])
            .getOne()
    }
}
