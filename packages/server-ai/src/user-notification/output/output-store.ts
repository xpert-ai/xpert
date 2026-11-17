import { ConflictException, Injectable } from '@nestjs/common'
import { DataSource, EntityManager, IsNull } from 'typeorm'
import { createHash } from 'node:crypto'
import { agentOutputReferenceSchema, type AgentOutputReference, type OutputQuietHours } from '@xpert-ai/contracts'
import type { AgentEventContext, AgentOutputSource } from '@xpert-ai/plugin-sdk'
import { AgentEventBinding } from '../../agent-event/agent-event.entity'
import { enqueueNotification } from '../notification.outbox'
import {
    AgentOutputDelivery,
    AgentOutputMember,
    AgentOutputMessage,
    AgentOutputPreference
} from '../notification.entities'
import { notificationError } from '../notification.errors'

export type Recipient = Pick<AgentEventBinding, 'tenantId' | 'organizationId' | 'userId'>

export function digest(parts: unknown[]) {
    return createHash('sha256').update(JSON.stringify(parts)).digest('hex')
}

export function lockRecipient(tx: EntityManager, scope: Recipient) {
    return tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
        digest([scope.tenantId, scope.organizationId, scope.userId])
    ])
}

export function quietUntil(now: Date, quiet?: OutputQuietHours | null): Date | null {
    if (!quiet) return null
    const format = new Intl.DateTimeFormat('en-GB', {
        timeZone: quiet.zone,
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
    })
    const inside = (date: Date) => {
        const time = format.format(date)
        return quiet.start < quiet.end
            ? time >= quiet.start && time < quiet.end
            : time >= quiet.start || time < quiet.end
    }
    if (!inside(now)) return null
    // Advance real instants so skipped and repeated local minutes both follow the user's clock.
    let instant = new Date(now)
    instant.setUTCSeconds(0, 0)
    do {
        instant = new Date(instant.getTime() + 60000)
    } while (inside(instant))
    return instant
}

export const outputBatchSize = 20

export function outputGroupKey(
    scope: Recipient,
    channel: AgentOutputPreference['channel'],
    kind: string,
    revision: number,
    window: string
) {
    return digest([scope.tenantId, scope.organizationId, scope.userId, channel, kind, revision, window])
}

@Injectable()
export class OutputStore {
    constructor(private readonly db: DataSource) {}

    async collect(binding: AgentEventBinding, context: AgentEventContext, source: AgentOutputSource) {
        let failure: { error: unknown } | undefined
        for (const raw of await source.listPending(context, 32)) {
            context.signal.throwIfAborted()
            let authorized: AgentOutputReference | undefined
            try {
                const ref = agentOutputReferenceSchema.parse(raw) as AgentOutputReference
                if (!source.kinds.some((k) => k.key === ref.kind) || ref.recipientId !== binding.userId)
                    throw notificationError('denied')
                authorized = ref
                const id = await this.storeReference(binding, ref)
                if ((await source.acknowledge(context, ref, id)) === 'conflict') throw notificationError('conflict')
            } catch (error) {
                context.signal.throwIfAborted()
                failure ??= { error }
                if (authorized && source.defer) {
                    const retryAt =
                        error instanceof ConflictException ? null : new Date(Date.now() + 60_000).toISOString()
                    try {
                        await source.defer(context, authorized, retryAt)
                    } catch (deferError) {
                        failure = { error: deferError }
                    }
                }
            }
        }
        if (failure) throw failure.error
    }

    private storeReference(binding: AgentEventBinding, ref: AgentOutputReference) {
        return this.db.transaction(async (tx) => {
            const { tenantId, organizationId, userId, plugin } = binding
            const scope = { tenantId, organizationId, userId }
            await lockRecipient(tx, scope)
            const active = await tx.findOne(AgentEventBinding, {
                where: { ...scope, id: binding.id, revision: binding.revision, state: 'enabled' },
                lock: { mode: 'pessimistic_read' }
            })
            if (!active) throw notificationError('unavailable')
            const key = { ...scope, plugin, kind: ref.kind, outputKey: ref.key }
            const existing = await tx.findOneBy(AgentOutputMessage, key)
            if (existing) {
                if (
                    existing.reference.revision !== ref.revision ||
                    existing.reference.publishedAt !== ref.publishedAt ||
                    existing.bindingId !== binding.id ||
                    existing.bindingRevision !== binding.revision
                )
                    throw notificationError('conflict')
                return existing.id
            }
            const message = await tx.save(AgentOutputMessage, {
                ...key,
                bindingId: binding.id,
                bindingRevision: binding.revision,
                reference: ref
            })
            for (const channel of ['in_app', 'lark'] as const) {
                const p = await tx.findOneBy(AgentOutputPreference, { ...scope, kind: ref.kind, channel })
                if (
                    !(p?.enabled ?? channel === 'in_app') ||
                    (p && Date.parse(ref.publishedAt) < p.enabledSince.getTime())
                )
                    continue
                const due = quietUntil(new Date(), p?.quiet)
                const revision = p?.revision ?? 0
                const groupKey = outputGroupKey(scope, channel, ref.kind, revision, due?.toISOString() ?? message.id)
                let delivery =
                    due &&
                    (await tx.findOne(AgentOutputDelivery, {
                        where: { groupKey, state: 'pending', attemptId: IsNull() },
                        order: { createdAt: 'DESC', id: 'DESC' },
                        lock: { mode: 'pessimistic_write' }
                    }))
                if (
                    !delivery ||
                    (await tx.countBy(AgentOutputMember, { deliveryId: delivery.id })) >= outputBatchSize
                ) {
                    delivery = await tx.save(AgentOutputDelivery, {
                        ...scope,
                        kind: ref.kind,
                        channel,
                        groupKey,
                        preferenceRevision: revision,
                        state: 'pending'
                    })
                    await enqueueNotification(
                        tx,
                        tenantId,
                        userId,
                        'output:' + delivery.id,
                        { type: 'agent.output.dispatch', deliveryId: delivery.id },
                        due ?? new Date()
                    )
                }
                await tx.insert(AgentOutputMember, {
                    tenantId,
                    deliveryId: delivery.id,
                    messageId: message.id,
                    channel
                })
            }
            return message.id
        })
    }
}
