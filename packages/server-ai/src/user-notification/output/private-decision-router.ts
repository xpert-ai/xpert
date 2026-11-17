import { HttpException, Injectable } from '@nestjs/common'
import { DataSource, MoreThan } from 'typeorm'
import { ExternalIdentityBinding } from '@xpert-ai/server-core'
import {
    humanDecisionSchema,
    privateDecisionFeedbackStatusSchema,
    privateDecisionReplySchema,
    type HumanDecisionResult,
    type PrivateDecisionFeedbackStatus,
    type PrivateDecisionReply
} from '@xpert-ai/contracts'
import type { AgentEventDelivery } from '@xpert-ai/plugin-sdk'
import { AgentEventBinding } from '../../agent-event/agent-event.entity'
import { AgentEventSources, sourceContext } from '../../agent-event/agent-event-sources'
import { EventBindingAccessService } from '../../agent-event/event-binding-access.service'
import { RuntimeMessageAccessService } from '../../handoff/runtime-messaging/runtime-message-access.service'
import {
    AgentOutputDelivery,
    AgentOutputMember,
    AgentOutputMessage,
    AgentOutputPreference
} from '../notification.entities'
import { OutputPreferences } from './output-preferences'
import { digest } from './output-store'

@Injectable()
export class PrivateDecisionRouter {
    constructor(
        private readonly db: DataSource,
        private readonly preferences: OutputPreferences,
        private readonly actors: RuntimeMessageAccessService,
        private readonly access: EventBindingAccessService,
        private readonly sources: AgentEventSources
    ) {}

    async submit(
        inbound: AgentEventBinding,
        claim: Pick<AgentEventDelivery, 'event' | 'receiptId'>,
        reply: PrivateDecisionReply,
        signal: AbortSignal
    ): Promise<HumanDecisionResult | { status: 'unrelated' }> {
        const denied = { status: 'forbidden' } as const
        const parsed = privateDecisionReplySchema.safeParse(reply)
        if (
            !parsed.success ||
            inbound.plugin !== '@xpert-ai/plugin-lark' ||
            inbound.adapter !== 'lark.inbound' ||
            claim.event.subject.kind !== 'lark-chat' ||
            claim.event.subject.key !== reply.chatId ||
            claim.event.type !== (reply.input.type === 'button' ? 'lark.card.action' : 'lark.message.received')
        )
            return denied
        const scope = { tenantId: inbound.tenantId, organizationId: inbound.organizationId }
        const where = { ...scope, channel: 'lark' as const, decisionIntegrationId: inbound.sourceBindingRef }
        const deliveries = await this.db.manager.find(AgentOutputDelivery, {
            where: { ...where, providerMessageId: reply.parentId },
            take: 2
        })
        if (!deliveries.length) {
            // An authenticated callback can beat the channel receipt update. Retry only inside the send recovery window.
            const pending = await this.db.manager.existsBy(AgentOutputDelivery, {
                ...where,
                state: 'pending',
                attemptedAt: MoreThan(new Date(Date.now() - 120000)),
                ...(reply.input.type === 'button' ? { attemptId: reply.input.interactionId } : {})
            })
            if (pending) throw new Error('decision_delivery_pending')
            return reply.input.type === 'button' ? denied : { status: 'unrelated' }
        }
        const [d] = deliveries
        const route = d.decisionRoute
        if (
            deliveries.length !== 1 ||
            !route ||
            d.state !== 'accepted' ||
            d.decisionChatDigest !== digest([reply.chatId]) ||
            (reply.input.type === 'button' && reply.input.interactionId !== d.attemptId)
        )
            return denied
        const parsedDecision = humanDecisionSchema.safeParse(route.decision)
        if (!parsedDecision.success) return denied
        const decision = parsedDecision.data
        const answer = reply.input
        const choices = decision.choices.filter((c) =>
            answer.type === 'button' ? c.key === answer.choice : c.replyCommand === answer.text
        )
        if (choices.length !== 1) return denied
        const bindingScope = { tenantId: d.tenantId, userId: d.userId, provider: 'lark' }
        let updateCard:
            | ((id: string, status: PrivateDecisionFeedbackStatus, label: string) => Promise<void>)
            | undefined
        let result: HumanDecisionResult
        try {
            result = await this.db.transaction(async (tx) => {
                // Keep identity and channel preference stable until the source commits its idempotent disposition.
                const identity = await tx.findOne(ExternalIdentityBinding, {
                    where: bindingScope,
                    lock: { mode: 'pessimistic_read' }
                })
                if (!identity || (reply.unionId && reply.unionId !== identity.subjectId)) return denied
                return this.actors.withControlActor(d, async () => {
                    const p = await tx.findOne(AgentOutputPreference, {
                        where: { ...scope, userId: d.userId, kind: d.kind, channel: 'lark' },
                        lock: { mode: 'pessimistic_read' }
                    })
                    if (
                        !p?.enabled ||
                        p.integrationId !== inbound.sourceBindingRef ||
                        p.revision !== d.preferenceRevision ||
                        p.targetDigest !== route.fingerprint
                    )
                        return denied
                    const target = await this.preferences.target(d, p.integrationId)
                    if (
                        !target ||
                        target.appId !== d.decisionAppId ||
                        target.recipient !== reply.openId ||
                        target.subject !== identity.subjectId ||
                        target.fingerprint !== route.fingerprint
                    )
                        return denied
                    const member = await tx.findOneBy(AgentOutputMember, {
                        id: route.memberId,
                        tenantId: d.tenantId,
                        deliveryId: d.id,
                        channel: 'lark',
                        included: true
                    })
                    if (!member) return denied
                    const message = await tx.findOneBy(AgentOutputMessage, {
                        id: member.messageId,
                        ...scope,
                        userId: d.userId,
                        kind: d.kind
                    })
                    if (!message || message.reference.key !== message.outputKey) return denied
                    const source = await tx.findOne(AgentEventBinding, {
                        where: {
                            id: message.bindingId,
                            revision: message.bindingRevision,
                            ...scope,
                            userId: d.userId,
                            plugin: message.plugin,
                            state: 'enabled'
                        },
                        lock: { mode: 'pessimistic_read' }
                    })
                    if (!source) return denied
                    await this.access.assertAccessible(source, true)
                    const producer = this.sources.resolve(source).outputs
                    if (!producer?.submitDecision) return denied
                    signal.throwIfAborted()
                    updateCard = target.updateDecision
                    return producer.submitDecision(
                        sourceContext(source, signal),
                        {
                            schemaVersion: 1,
                            requestId: message.reference.key,
                            sourceRevision: message.reference.revision,
                            requestVersion: decision.requestVersion,
                            choice: choices[0].key,
                            commandId: claim.receiptId
                        },
                        'lark'
                    )
                })
            })
        } catch (error) {
            if (error instanceof HttpException && [401, 403, 404].includes(error.getStatus())) return denied
            throw error
        }

        const feedback = privateDecisionFeedbackStatusSchema.safeParse(result.status)
        if (updateCard && feedback.success) {
            // Let a failed patch retry the same receipt and original card after the source decision has committed.
            await updateCard(reply.parentId, feedback.data, choices[0].label.zh_Hans)
        }
        return result
    }
}
