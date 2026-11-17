import { createHash } from 'node:crypto'
import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common'
import { QueryBus } from '@nestjs/cqrs'
import type {
    AgentEventContext,
    AgentEventDelivery,
    AgentEventPublisher,
    AgentEventFollowUp,
    EventDecision,
    IAgentMiddlewareContext,
    PluginAgentEventSource
} from '@xpert-ai/plugin-sdk'
import { DataSource, In, IsNull, LessThanOrEqual } from 'typeorm'
import { z } from 'zod/v3'
import { AssertChatConversationAccessQuery } from '../chat-conversation/queries/conversation-assert-access.query'
import { PublishedXpertAccessService } from '../xpert/published-xpert-access.service'
import { AgentEventBinding } from './agent-event.entity'
import { FollowUpTimer } from './follow-up-timer.entity'

import { timerSource } from './follow-up-timer.constants'
export { timerSource } from './follow-up-timer.constants'
export const setDeadline = z
    .object({ dueAt: z.string().datetime({ offset: true }), purpose: z.string().trim().min(1).max(2000) })
    .strict()
const type = 'agent.follow_up.due'
const icon = { type: 'font', value: 'clock' } as const

@Injectable()
export class FollowUpTimerSource implements PluginAgentEventSource {
    readonly key = timerSource.adapter
    readonly protocolVersion = 1
    readonly eventTypes = [
        {
            type,
            schemaVersion: 1,
            display: {
                icon,
                label: { en_US: 'Follow-up due', zh_Hans: '跟进到期' },
                category: { key: 'follow_up', icon, label: { en_US: 'Follow-ups', zh_Hans: '定时跟进' } }
            }
        }
    ] as const

    constructor(
        private readonly db: DataSource,
        private readonly queries: QueryBus,
        private readonly published: PublishedXpertAccessService
    ) {}

    private async scope(context: IAgentMiddlewareContext) {
        const { tenantId, organizationId, userId, conversationId, threadId, workspaceId, xpertId, projectId } = context
        if (!organizationId || !userId || !workspaceId || !xpertId || !conversationId || !threadId)
            throw new ForbiddenException('timer_scope_required')
        const target = await this.published.getAccessiblePublishedXpert(xpertId)
        if (!target.publishAt || target.organizationId !== organizationId || target.workspaceId !== workspaceId)
            throw new ForbiddenException('timer_target_changed')
        const family = await this.published.getAccessiblePublishedXpertFamilyIds(xpertId)
        await this.queries.execute(
            new AssertChatConversationAccessQuery(
                {
                    id: conversationId,
                    threadId,
                    createdById: userId,
                    tenantId,
                    organizationId,
                    projectId: projectId ?? IsNull(),
                    xpertId: In(family)
                },
                'contribute'
            )
        )
        return {
            key: { ...timerSource, tenantId, organizationId, xpertId, sourceBindingRef: conversationId },
            threadId,
            owner: { workspaceId, userId, projectId: projectId ?? null, publishedAt: target.publishAt }
        }
    }

    async set(context: IAgentMiddlewareContext, input: z.infer<typeof setDeadline>, requestKey: string) {
        if (!requestKey || requestKey.length > 256) throw new ConflictException('timer_request_key_required')
        const { key, threadId, owner } = await this.scope(context)
        const { dueAt, purpose } = setDeadline.parse(input)
        const deadline = new Date(dueAt)
        return this.db.transaction(async (tx) => {
            await tx
                .createQueryBuilder()
                .insert()
                .into(AgentEventBinding)
                .values({ ...key, ...owner, state: 'enabled', capture: true, revision: 1 })
                .orIgnore()
                .execute()
            const binding = await tx.findOneOrFail(AgentEventBinding, {
                where: key,
                lock: { mode: 'pessimistic_write' }
            })
            if (
                binding.userId !== owner.userId ||
                !binding.capture ||
                binding.state !== 'enabled' ||
                binding.projectId !== owner.projectId ||
                binding.publishedAt.getTime() !== owner.publishedAt.getTime()
            )
                throw new ForbiddenException('timer_binding_changed')
            let timer = await tx.findOneBy(FollowUpTimer, { binding: binding.id, requestKey })
            if (timer) {
                if (
                    timer.threadId !== threadId ||
                    timer.agentKey !== (context.agentKey ?? null) ||
                    timer.purpose !== purpose ||
                    timer.dueAt.getTime() !== deadline.getTime() ||
                    timer.revision !== binding.revision
                )
                    throw new ConflictException('timer_request_conflict')
            } else {
                if (deadline <= new Date()) throw new ConflictException('timer_future_deadline_required')
                timer = await tx.save(
                    FollowUpTimer,
                    tx.create(FollowUpTimer, {
                        tenantId: key.tenantId,
                        organizationId: key.organizationId,
                        binding: binding.id,
                        revision: binding.revision,
                        threadId,
                        agentKey: context.agentKey ?? null,
                        requestKey,
                        purpose,
                        dueAt: deadline,
                        state: 'waiting'
                    })
                )
            }
            return { timerId: timer.id, dueAt: timer.dueAt, state: timer.state }
        })
    }

    async cancel(context: IAgentMiddlewareContext, timerId: string) {
        const { key, threadId, owner } = await this.scope(context)
        const binding = await this.db.manager.findOneBy(AgentEventBinding, {
            ...key,
            userId: owner.userId,
            state: 'enabled'
        })
        if (!binding) throw new ConflictException('timer_not_active')
        const result = await this.db.manager.update(
            FollowUpTimer,
            {
                id: timerId,
                binding: binding.id,
                revision: binding.revision,
                threadId,
                state: In(['waiting', 'published', 'cancelled'])
            },
            { state: 'cancelled' }
        )
        if (!result.affected) throw new ConflictException('timer_not_active')
        return { timerId, state: 'cancelled' }
    }

    async list(context: IAgentMiddlewareContext) {
        const { key, threadId, owner } = await this.scope(context)
        const binding = await this.db.manager.findOneBy(AgentEventBinding, {
            ...key,
            userId: owner.userId,
            state: 'enabled'
        })
        if (!binding) return []
        return this.db.manager.find(FollowUpTimer, {
            where: { binding: binding.id, revision: binding.revision, threadId, state: In(['waiting', 'published']) },
            select: { id: true, dueAt: true, purpose: true, state: true },
            order: { dueAt: 'ASC', id: 'ASC' },
            take: 100
        })
    }

    async configure(context: AgentEventContext, enabled: boolean) {
        await this.db.manager
            .createQueryBuilder()
            .update(FollowUpTimer)
            .set({ state: 'cancelled' })
            .where('binding = :binding AND state IN (:...states) AND (revision < :revision OR :enabled = false)', {
                binding: context.bindingId,
                states: ['waiting', 'published'],
                revision: context.bindingRevision,
                enabled
            })
            .execute()
    }

    async drain(ctx: AgentEventContext, publisher: AgentEventPublisher, limit: number) {
        const timers = await this.db.manager.find(FollowUpTimer, {
            where: {
                binding: ctx.bindingId,
                revision: ctx.bindingRevision,
                state: 'waiting',
                dueAt: LessThanOrEqual(new Date())
            },
            order: { dueAt: 'ASC', id: 'ASC' },
            take: limit
        })
        for (const timer of timers) {
            const result = await publisher.publish({
                type,
                schemaVersion: 1,
                sourceEventId: timer.id,
                bindingRevision: timer.revision,
                occurredAt: timer.dueAt.toISOString(),
                subject: { kind: 'conversation', key: ctx.sourceBindingRef },
                fact: {
                    key: timer.id,
                    revision: '1',
                    sha256: createHash('sha256')
                        .update(
                            JSON.stringify([
                                timer.threadId,
                                timer.dueAt,
                                timer.purpose,
                                ...(timer.agentKey ? [timer.agentKey] : [])
                            ])
                        )
                        .digest('hex')
                }
            })
            if (result.status === 'rejected') throw new ConflictException(result.code)
            await this.db.manager.update(FollowUpTimer, { id: timer.id, state: 'waiting' }, { state: 'published' })
        }
        return { more: timers.length === limit }
    }

    async handle(
        ctx: AgentEventContext,
        delivery: AgentEventDelivery,
        followUp?: AgentEventFollowUp
    ): Promise<EventDecision> {
        if (!followUp) throw new Error('timer_wake_unavailable')
        const timer = await this.db.transaction(async (tx) => {
            const timer = await tx.findOne(FollowUpTimer, {
                where: { id: delivery.event.sourceEventId, binding: ctx.bindingId, revision: ctx.bindingRevision },
                lock: { mode: 'pessimistic_write' }
            })
            if (!timer || timer.state === 'cancelled') return null
            if (timer.dueAt > new Date()) throw new ConflictException('timer_not_due')
            if (timer.state !== 'fired') await tx.update(FollowUpTimer, timer.id, { state: 'fired' })
            return timer
        })
        if (!timer) return { status: 'ignored', reasonCode: 'timer_cancelled' }
        await followUp.wake({
            conversationId: ctx.sourceBindingRef,
            threadId: timer.threadId,
            agentKey: timer.agentKey ?? undefined,
            prompt:
                'Your follow-up deadline is due. Check the latest state in this conversation and its authorized sources. If resolved, finish quietly. Otherwise take the necessary action or set a justified next deadline. Follow-up purpose: ' +
                timer.purpose
        })
        return { status: 'handled', operationKey: timer.id, resultRef: { kind: 'follow-up-timer', key: timer.id } }
    }

    async describe(
        ctx: AgentEventContext,
        event: AgentEventDelivery['event'],
        _decision: EventDecision | null,
        options?: { includeConversation: boolean }
    ) {
        const timer = await this.db.manager.findOneBy(FollowUpTimer, {
            binding: ctx.bindingId,
            id: event.sourceEventId
        })
        return timer
            ? {
                  title: timer.purpose,
                  conversation: options?.includeConversation
                      ? { conversationId: ctx.sourceBindingRef, threadId: timer.threadId }
                      : undefined
              }
            : null
    }
}
