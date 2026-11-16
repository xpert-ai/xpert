import { HttpException, Injectable } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { DataSource } from 'typeorm'
import { agentOutputPresentationSchema, type AgentOutputItem, type OpenConversationAction } from '@xpert-ai/contracts'
import { AgentEventBinding } from '../../agent-event/agent-event.entity'
import { AgentEventSources, sourceContext } from '../../agent-event/agent-event.runtime'
import { EventBindingAccessService } from '../../agent-event/event-binding-access.service'
import { RuntimeMessageAccessService } from '../../handoff/runtime-messaging/runtime-message-access.service'
import {
    AgentOutputDelivery,
    AgentOutputMember,
    AgentOutputMessage,
    AgentOutputPreference,
    NotificationOutbox,
    UserNotificationEntity
} from '../notification.entities'
import { OutputPreferences } from './output-preferences'
import { lockRecipient, quietUntil } from './output-store'

function denied(error: unknown) {
    return error instanceof HttpException && [401, 403, 404].includes(error.getStatus())
}

@Injectable()
export class OutputDispatch {
    constructor(
        private readonly db: DataSource,
        private readonly sources: AgentEventSources,
        private readonly access: EventBindingAccessService,
        private readonly actors: RuntimeMessageAccessService,
        private readonly preferences: OutputPreferences
    ) {}

    private async items(
        delivery: AgentOutputDelivery,
        operation: 'read' | 'dispatch',
        includeDetails = false,
        preparedMembers?: AgentOutputMember[]
    ): Promise<AgentOutputItem[]> {
        const members =
            preparedMembers ??
            (await this.db.manager.findBy(AgentOutputMember, { deliveryId: delivery.id, included: true }))
        const items: AgentOutputItem[] = []
        for (const member of members) {
            const message = await this.db.manager.findOneByOrFail(AgentOutputMessage, {
                id: member.messageId,
                tenantId: delivery.tenantId,
                organizationId: delivery.organizationId,
                userId: delivery.userId
            })
            const binding = await this.db.manager.findOneBy(AgentEventBinding, {
                id: message.bindingId,
                revision: message.bindingRevision,
                plugin: message.plugin,
                state: 'enabled',
                tenantId: message.tenantId,
                organizationId: message.organizationId,
                userId: message.userId
            })
            if (!binding) continue
            try {
                await this.access.assertAccessible(binding)
                const source = this.sources.resolve(binding).outputs
                if (!source) continue
                const result = agentOutputPresentationSchema.parse(
                    await source.resolveForRecipient(
                        sourceContext(binding, AbortSignal.timeout(10000)),
                        message.reference
                    )
                )
                if (result.status === 'unavailable') throw new Error('output_source_unavailable')
                if (result.status !== 'visible') continue
                let action: OpenConversationAction | null = null
                if (result.conversation) {
                    try {
                        action =
                            (await this.access.conversationAction(
                                binding,
                                result.conversation.conversationId,
                                result.conversation.threadId
                            )) ?? null
                    } catch {
                        // Navigation is optional and must be positively authorized.
                    }
                }
                const fields =
                    includeDetails &&
                    result.fields?.map(({ label, value }) => ({
                        label: { en_US: label.en_US, zh_Hans: label.zh_Hans },
                        value
                    }))
                items.push({ id: member.id, title: result.title, action, ...(fields ? { fields } : {}) })
            } catch (error) {
                if (operation === 'dispatch' && !denied(error)) throw error
            }
        }
        return items
    }

    async view(id: string, tenantId: string, userId: string, includeDetails = false) {
        const delivery = await this.db.manager.findOneBy(AgentOutputDelivery, {
            id,
            tenantId,
            userId,
            state: 'delivered',
            channel: 'in_app'
        })
        if (!delivery) return []
        try {
            return await this.actors.withControlActor(delivery, () => this.items(delivery, 'read', includeDetails))
        } catch (error) {
            if (denied(error)) return []
            throw error
        }
    }

    async dispatch(row: NotificationOutbox, id: string) {
        const d = await this.db.manager.findOneByOrFail(AgentOutputDelivery, {
            id,
            tenantId: row.tenantId,
            userId: row.userId
        })
        if (d.state !== 'pending') return
        if (d.attemptId) {
            // A previous lease reached the external-call boundary. Recovery needs no live channel or plugin.
            await this.db.transaction(async (tx) => {
                const owned = await tx.findOne(NotificationOutbox, {
                    where: { id: row.id, leaseId: row.leaseId, state: 'pending' },
                    lock: { mode: 'pessimistic_write' }
                })
                if (owned)
                    await tx.update(
                        AgentOutputDelivery,
                        { id, state: 'pending', attemptId: d.attemptId },
                        {
                            state: 'unknown',
                            reason: 'attempt_interrupted'
                        }
                    )
            })
            return
        }
        const attempt = randomUUID()
        let send:
            | ((
                  text: string,
                  attemptId: string
              ) => Promise<{ status: 'accepted'; messageId: string } | { status: 'failed' | 'unknown' }>)
            | undefined
        const initialMembers = await this.db.manager.findBy(AgentOutputMember, { deliveryId: id, included: true })
        const initialIds = new Set(initialMembers.map((member) => member.id))
        const result = await this.actors
            .withControlActor(d, async () => {
                const p = await this.db.manager.findOneBy(AgentOutputPreference, preferenceKey(d))
                if (d.channel === 'lark' && p?.enabled && p.integrationId && p.revision === d.preferenceRevision) {
                    const target = await this.preferences.target(d, p.integrationId)
                    if (target && target.fingerprint === p.targetDigest) send = target.send
                }
                return this.items(d, 'dispatch', false, initialMembers)
            })
            .catch((error) => {
                if (denied(error)) return []
                throw error
            })
        const outcome = await this.db.transaction(async (tx) => {
            await lockRecipient(tx, d)
            const owned = await tx.findOne(NotificationOutbox, {
                where: { id: row.id, leaseId: row.leaseId, state: 'pending' },
                lock: { mode: 'pessimistic_write' }
            })
            if (!owned) return 'done'
            const delivery = await tx.findOneOrFail(AgentOutputDelivery, {
                where: { id },
                lock: { mode: 'pessimistic_write' }
            })
            if (delivery.state !== 'pending') return 'done'
            if (delivery.attemptId) {
                await tx.update(AgentOutputDelivery, id, { state: 'unknown', reason: 'attempt_interrupted' })
                return 'done'
            }
            const members = await tx.findBy(AgentOutputMember, { deliveryId: id })
            if (members.length !== initialIds.size || members.some((member) => !initialIds.has(member.id)))
                throw new Error('output_batch_changed')
            const p = await tx.findOneBy(AgentOutputPreference, preferenceKey(d))
            if (
                !(p?.enabled ?? d.channel === 'in_app') ||
                (p?.revision ?? 0) !== d.preferenceRevision ||
                (d.channel === 'lark' && !send) ||
                !result.length
            ) {
                await tx.update(AgentOutputDelivery, id, {
                    state: 'cancelled',
                    reason: 'no_authorized_destination_or_item'
                })
                return 'done'
            }
            const due = quietUntil(new Date(), p?.quiet)
            if (due) {
                await tx.update(NotificationOutbox, owned.id, {
                    availableAt: due,
                    leaseId: null,
                    leaseUntil: null,
                    attempts: 0
                })
                return 'deferred'
            }
            for (const member of members)
                if (!result.some((i) => i.id === member.id))
                    await tx.update(AgentOutputMember, member.id, { included: false })
            if (d.channel === 'in_app') {
                await tx.insert(UserNotificationEntity, {
                    tenantId: d.tenantId,
                    userId: d.userId,
                    kind: 'agent.output',
                    eventKey: row.eventKey,
                    source: { type: 'agent_output', deliveryId: id }
                })
                await tx.update(AgentOutputDelivery, id, {
                    state: 'delivered',
                    attemptId: attempt,
                    attemptedAt: new Date()
                })
                return 'done'
            }
            await tx.update(AgentOutputDelivery, id, { attemptId: attempt, attemptedAt: new Date() })
            return 'send'
        })
        if (outcome === 'send' && send) {
            const receipt = await send(result.map((i) => i.title).join('\n'), attempt).catch(
                () => ({ status: 'unknown' }) as const
            )
            // An affirmative receipt may arrive after the replacement worker has recorded an unknown outcome.
            await this.db.manager.update(
                AgentOutputDelivery,
                { id, attemptId: attempt },
                {
                    state: receipt.status,
                    providerMessageId: receipt.status === 'accepted' ? receipt.messageId : null,
                    reason: receipt.status === 'accepted' ? null : 'channel_' + receipt.status
                }
            )
        }
        return outcome
    }
}

function preferenceKey(d: AgentOutputDelivery) {
    const { tenantId, organizationId, userId, kind, channel } = d
    return { tenantId, organizationId, userId, kind, channel }
}
