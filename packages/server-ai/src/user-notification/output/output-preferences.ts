import { AgentEventSources } from '../../agent-event/agent-event-sources'
import { AgentEventBinding } from '../../agent-event/agent-event.entity'
import { EventBindingAccessService } from '../../agent-event/event-binding-access.service'
import { HttpException, Injectable } from '@nestjs/common'
import { ExternalIdentityBinding, IntegrationService } from '@xpert-ai/server-core'
import { ChatChannelRegistry, RequestContext } from '@xpert-ai/plugin-sdk'
import type { PrivateDecisionFeedbackStatus, PrivateDecisionCard, OutputPreference } from '@xpert-ai/contracts'
import { DataSource, EntityManager, In } from 'typeorm'
import {
    AgentOutputPreference,
    AgentOutputDelivery,
    AgentOutputMember,
    NotificationOutbox
} from '../notification.entities'
import { notificationScope } from '../notification.scope'
import { notificationError } from '../notification.errors'
import { RuntimeMessageAccessService } from '../../handoff/runtime-messaging/runtime-message-access.service'
import { digest, lockRecipient, outputBatchSize, outputGroupKey, quietUntil, type Recipient } from './output-store'

@Injectable()
export class OutputPreferences {
    constructor(
        private readonly db: DataSource,
        private readonly integrations: IntegrationService,
        private readonly channels: ChatChannelRegistry,
        private readonly actors: RuntimeMessageAccessService,
        private readonly sources: AgentEventSources,
        private readonly access: EventBindingAccessService
    ) {}

    private scope(): Recipient {
        const organizationId = RequestContext.getScope().organizationId
        if (!organizationId) throw notificationError('denied')
        return { ...notificationScope(), organizationId }
    }

    private async kinds(scope: Recipient) {
        const kinds = new Map<string, { key: string; label: { en_US: string; zh_Hans: string } }>()
        for (const binding of await this.db.manager.findBy(AgentEventBinding, { ...scope, state: 'enabled' })) {
            try {
                await this.access.assertAccessible(binding)
                for (const kind of this.sources.resolve(binding).outputs?.kinds ?? []) kinds.set(kind.key, kind)
            } catch (error) {
                if (!(error instanceof HttpException && [401, 403, 404].includes(error.getStatus()))) throw error
            }
        }
        return Array.from(kinds.values())
    }

    async list() {
        const scope = this.scope()
        return this.actors.withControlActor(scope, async () => {
            const preferences = await this.db
                .getRepository(AgentOutputPreference)
                .find({ where: scope, select: ['kind', 'channel', 'enabled', 'quiet', 'integrationId'] })
            const integrations = await this.integrations.availableForUsage({ provider: 'lark', usage: 'invoke' })
            return {
                preferences,
                kinds: await this.kinds(scope),
                integrations: integrations.map((i) => ({ id: i.id, name: i.name }))
            }
        })
    }

    async target(scope: Recipient, integrationId: string) {
        const integration = await this.integrations.readForUsage(integrationId, 'invoke', scope)
        if (!integration || integration.provider !== 'lark') return null
        const binding = await this.db.getRepository(ExternalIdentityBinding).findOneBy({
            userId: scope.userId,
            tenantId: scope.tenantId,
            provider: 'lark'
        })
        if (!binding) return null
        const channel = this.channels.get('lark', scope.organizationId)
        const provenance = this.channels.getSource(channel)
        if (
            provenance.kind !== 'plugin' ||
            provenance.pluginName !== '@xpert-ai/plugin-lark' ||
            !channel.resolvePrivateDestination ||
            !channel.sendPrivateNotification
        )
            return null
        // The confirmed Feishu OAuth profile already identifies this bot's recipient without directory privileges.
        const target =
            verifiedLarkRecipient(binding, integration.options?.appId) ??
            (await channel.resolvePrivateDestination(integration, binding.subjectId))
        if (!target) return null
        return {
            appId: target.appId,
            recipient: target.recipient,
            subject: binding.subjectId,
            sendDecision:
                channel.sendPrivateDecision &&
                ((card: PrivateDecisionCard, attemptId: string) =>
                    channel.sendPrivateDecision!(integration, target.recipient, card, attemptId)),
            updateDecision:
                channel.updatePrivateDecision &&
                ((message: string, status: PrivateDecisionFeedbackStatus, choiceLabel: string) =>
                    channel.updatePrivateDecision!(integration, message, status, choiceLabel)),
            fingerprint: digest([
                binding.id,
                binding.subjectId,
                binding.updatedAt,
                integration.id,
                target.appId,
                target.recipient
            ]),
            send: (text: string, attempt: string) =>
                channel.sendPrivateNotification!(integration, target.recipient, text, attempt)
        }
    }

    async save(input: OutputPreference) {
        const scope = this.scope()
        return this.actors.withControlActor(scope, async () => {
            if (input.enabled && !(await this.kinds(scope)).some((k) => k.key === input.kind))
                throw notificationError('denied')
            const target =
                input.enabled && input.channel === 'lark' && input.integrationId
                    ? await this.target(scope, input.integrationId)
                    : null
            if (input.channel === 'lark' && input.enabled && !target) throw notificationError('denied')
            const key = { ...scope, kind: input.kind, channel: input.channel }
            await this.db.transaction(async (tx) => {
                await lockRecipient(tx, scope)
                const old = await tx.findOneBy(AgentOutputPreference, key)
                const fingerprint = target?.fingerprint ?? null
                const changed =
                    input.enabled !== (old?.enabled ?? input.channel === 'in_app') ||
                    fingerprint !== (old?.targetDigest ?? null) ||
                    input.integrationId !== (old?.integrationId ?? null)
                const preference = await tx.save(AgentOutputPreference, {
                    ...old,
                    ...key,
                    ...input,
                    targetDigest: fingerprint,
                    revision: (old?.revision ?? 0) + (changed ? 1 : 0),
                    enabledSince: changed ? new Date() : (old?.enabledSince ?? new Date(0))
                })
                const quietChanged =
                    input.quiet?.zone !== old?.quiet?.zone ||
                    input.quiet?.start !== old?.quiet?.start ||
                    input.quiet?.end !== old?.quiet?.end
                if (changed || quietChanged) await this.reschedule(tx, preference, key, quietChanged && !changed)
            })
            return { saved: true }
        })
    }

    // The caller holds the same recipient lock used by collection and dispatch.
    private async reschedule(
        tx: EntityManager,
        preference: AgentOutputPreference,
        key: Recipient & Pick<OutputPreference, 'kind' | 'channel'>,
        regroup: boolean
    ) {
        const now = new Date()
        const due = regroup && preference.enabled ? quietUntil(now, preference.quiet) : null
        const pending = await tx.find(AgentOutputDelivery, {
            where: { ...key, state: 'pending' },
            order: { createdAt: 'ASC', id: 'ASC' }
        })
        const mutable = pending.filter((d) => !d.attemptId && d.preferenceRevision === preference.revision)
        if (due && mutable.length) {
            const groupKey = outputGroupKey(key, key.channel, key.kind, preference.revision, due.toISOString())
            const members = await tx.find(AgentOutputMember, {
                where: { deliveryId: In(mutable.map((d) => d.id)) },
                order: { createdAt: 'ASC', id: 'ASC' }
            })
            for (const [index, delivery] of mutable.entries()) {
                const batch = members.slice(index * outputBatchSize, (index + 1) * outputBatchSize)
                if (!batch.length) {
                    await tx.update(AgentOutputDelivery, delivery.id, {
                        state: 'cancelled',
                        reason: 'quiet_window_regrouped'
                    })
                    continue
                }
                await tx.update(AgentOutputDelivery, delivery.id, { groupKey })
                const moved = batch.filter((member) => member.deliveryId !== delivery.id)
                if (moved.length)
                    await tx.update(AgentOutputMember, { id: In(moved.map((m) => m.id)) }, { deliveryId: delivery.id })
            }
        }
        for (const delivery of pending) {
            await tx.update(
                NotificationOutbox,
                { tenantId: key.tenantId, eventKey: 'output:' + delivery.id, state: 'pending' },
                { availableAt: now }
            )
        }
    }
}

export function verifiedLarkRecipient(binding: Pick<ExternalIdentityBinding, 'subjectId' | 'profile'>, appId: unknown) {
    const profile = binding.profile
    if (
        !profile ||
        typeof appId !== 'string' ||
        !appId ||
        profile.appId !== appId ||
        profile.unionId !== binding.subjectId ||
        typeof profile.openId !== 'string' ||
        !profile.openId
    )
        return null
    return { appId, recipient: profile.openId }
}
