import { Injectable } from '@nestjs/common'
import { isClientToolRequest, isHITLRequest, isLangGraphInterruptPayload } from '@xpert-ai/chatkit-types'
import { DataSource } from 'typeorm'
import { createHash } from 'node:crypto'
import { ChatConversation } from '../chat-conversation/conversation.entity'
import { ChatConversationThread } from '../chat-conversation/conversation-thread.entity'
import { GroupParticipant, GroupMessageRecipient, GroupInteraction } from './group.entity'
import { GroupAccessService } from './group-access.service'
import { GroupOutboxService } from './group-outbox.service'
import { groupConflict, groupDenied, groupInvalid } from './group.errors'
import {
    GroupInteractionRequest,
    GroupInteractionResponse,
    parseGroupInteractionRequests
} from './group-interactions.schema'

/**
 * Invariants: group observers never receive private approval/tool payloads by default.
 * Only the assigned human may claim and complete them; a claim ID excludes competing tabs.
 * Completion updates the existing receipt atomically, then reuses Handoff to resume execution.
 */
@Injectable()
export class GroupInteractionsService {
    constructor(
        private readonly db: DataSource,
        private readonly access: GroupAccessService,
        private readonly outbox: GroupOutboxService
    ) {}

    /** Record supported runtime interrupts idempotently, scoped to their originating execution. */
    async register(
        receipt: GroupMessageRecipient,
        member: GroupParticipant,
        assignedUserId: string,
        operation: unknown
    ) {
        if (!isLangGraphInterruptPayload(operation)) return
        const requests: GroupInteractionRequest[] = []
        for (const task of operation.tasks)
            for (const interrupt of task.interrupts) {
                if (isClientToolRequest(interrupt.value))
                    requests.push({ kind: 'client_tool', request: interrupt.value })
                else if (isHITLRequest(interrupt.value)) requests.push({ kind: 'approval', request: interrupt.value })
            }
        if (!requests.length) return
        const interactionId = `${receipt.executionId}:${createHash('sha256').update(JSON.stringify(requests)).digest('hex')}`
        await this.db
            .getRepository(GroupInteraction)
            .createQueryBuilder()
            .insert()
            .values({
                tenantId: receipt.tenantId,
                organizationId: receipt.organizationId,
                groupId: receipt.groupId,
                interactionId,
                participantId: member.id,
                assignedUserId,
                recipientId: receipt.id,
                runId: receipt.executionId,
                payload: requests
            })
            .orIgnore()
            .execute()
    }

    /** Claim for the assigned human and return private requests only while the runtime is interrupted. */
    async claim(groupId: string, id: string, claimId: string) {
        const { actor } = await this.access.authorize(groupId)
        return this.db.transaction(async (manager) => {
            await manager.findOne(ChatConversation, { where: { id: groupId }, lock: { mode: 'pessimistic_write' } })
            const interaction = await manager.findOne(GroupInteraction, {
                where: { id, groupId, assignedUserId: actor.subjectId },
                lock: { mode: 'pessimistic_write' }
            })
            if (!interaction) throw groupDenied()
            if (
                !['pending', 'claimed'].includes(interaction.status) ||
                (interaction.claimId && interaction.claimId !== claimId)
            )
                throw groupConflict()
            const member = await manager.findOneBy(GroupParticipant, {
                id: interaction.participantId,
                groupId,
                active: true
            })
            if (!member) throw groupDenied()
            const thread = await manager.findOneBy(ChatConversationThread, { threadId: member.runtimeThreadId })
            if (
                !thread ||
                thread.status !== 'interrupted' ||
                (thread.runtimeContinuationBlockedAt && interaction.createdAt <= thread.runtimeContinuationBlockedAt) ||
                !thread.operation
            )
                throw groupConflict()
            interaction.claimId = claimId
            interaction.claimedBy = actor.subjectId
            interaction.status = 'claimed'
            await manager.save(interaction)
            await manager.increment(ChatConversation, { id: groupId }, 'revision', 1)
            return { id, claimId, requests: parseGroupInteractionRequests(interaction.payload) }
        })
    }

    /** Match tool IDs and allowed decisions, persist the real actor, and resume after commit. */
    async respond(groupId: string, id: string, input: GroupInteractionResponse) {
        const { actor } = await this.access.authorize(groupId)
        await this.db.transaction(async (manager) => {
            await manager.findOne(ChatConversation, { where: { id: groupId }, lock: { mode: 'pessimistic_write' } })
            const interaction = await manager.findOne(GroupInteraction, {
                where: { id, groupId, assignedUserId: actor.subjectId },
                lock: { mode: 'pessimistic_write' }
            })
            if (!interaction || interaction.claimId !== input.claimId || interaction.claimedBy !== actor.subjectId)
                throw groupDenied()
            if (interaction.status === 'completed') return
            if (interaction.status !== 'claimed') throw groupConflict()
            const requests = parseGroupInteractionRequests(interaction.payload)
            const calls = requests.flatMap((item) => (item.kind === 'client_tool' ? item.request.clientToolCalls : []))
            const reviews = requests.flatMap((item) =>
                item.kind === 'approval'
                    ? item.request.actionRequests.map((action) => ({
                          action,
                          config: item.request.reviewConfigs.find((config) => config.actionName === action.name)
                      }))
                    : []
            )
            if ((input.toolMessages?.length ?? 0) !== calls.length || (input.decisions?.length ?? 0) !== reviews.length)
                throw groupInvalid()
            if (
                new Set(input.toolMessages?.map((message) => message.tool_call_id)).size !== calls.length ||
                calls.some(
                    (call) =>
                        !input.toolMessages?.some(
                            (message) =>
                                message.tool_call_id === call.id && (!message.name || message.name === call.name)
                        )
                )
            )
                throw groupInvalid()
            if (reviews.some((review, index) => !review.config?.allowedDecisions.includes(input.decisions[index].type)))
                throw groupInvalid()
            if (
                reviews.some((review, index) => {
                    const decision = input.decisions[index]
                    return decision.type === 'edit' && decision.editedAction.name !== review.action.name
                })
            )
                throw groupInvalid()
            const member = await manager.findOneBy(GroupParticipant, {
                id: interaction.participantId,
                groupId,
                active: true
            })
            if (!member) throw groupDenied()
            const thread = await manager.findOne(ChatConversationThread, {
                where: { threadId: member.runtimeThreadId },
                lock: { mode: 'pessimistic_write' }
            })
            if (
                !thread ||
                thread.status !== 'interrupted' ||
                !thread.operation ||
                (thread.runtimeContinuationBlockedAt && interaction.createdAt <= thread.runtimeContinuationBlockedAt)
            )
                throw groupConflict()
            const receipt = await manager.findOne(GroupMessageRecipient, {
                where: { id: interaction.recipientId },
                lock: { mode: 'pessimistic_write' }
            })
            if (!receipt || receipt.status !== 'blocked') throw groupConflict()
            receipt.control = {
                actorId: actor.subjectId,
                decision: {
                    type: 'confirm',
                    payload: {
                        ...(input.decisions ? { decisions: input.decisions } : {}),
                        ...(input.toolMessages ? { toolMessages: input.toolMessages } : {})
                    }
                }
            }
            receipt.status = 'pending'
            receipt.phase = null
            receipt.nextAttemptAt = new Date()
            await manager.save(receipt)
            interaction.status = 'completed'
            await manager.save(interaction)
            await manager.increment(ChatConversation, { id: groupId }, 'revision', 1)
        })
        await this.outbox.flush(groupId)
        return { accepted: true }
    }
}
