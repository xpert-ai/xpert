import { Test } from '@nestjs/testing'
import { randomUUID } from 'node:crypto'
import { DataSource } from 'typeorm'
import type { LangGraphInterruptPayload } from '@xpert-ai/chatkit-types'
import { ChatConversation } from '../chat-conversation/conversation.entity'
import { ChatConversationThread } from '../chat-conversation/conversation-thread.entity'
import { GroupAccessService } from './group-access.service'
import { GroupOutboxService } from './group-outbox.service'
import { GroupInteractionsService } from './group-interactions.service'
import { GroupInteraction, GroupMessageRecipient, GroupParticipant } from './group.entity'
import {
    GroupInteractionRequest,
    GroupInteractionResponse,
    groupClaimSchema,
    groupInteractionResponseSchema,
    parseGroupInteractionRequests
} from './group-interactions.schema'

async function fixture() {
    const group = Object.assign(new ChatConversation(), { id: randomUUID() })
    const actor = Object.assign(new GroupParticipant(), { id: randomUUID(), subjectId: randomUUID(), kind: 'user' })
    const member = Object.assign(new GroupParticipant(), {
        id: randomUUID(),
        groupId: group.id,
        runtimeThreadId: randomUUID(),
        active: true
    })
    const thread = Object.assign(new ChatConversationThread(), {
        threadId: member.runtimeThreadId,
        status: 'interrupted',
        operation: { tasks: [] }
    })
    const receipt = Object.assign(new GroupMessageRecipient(), {
        id: randomUUID(),
        groupId: group.id,
        participantId: member.id,
        executionId: randomUUID(),
        status: 'blocked',
        tenantId: randomUUID(),
        organizationId: randomUUID()
    })
    const requests: GroupInteractionRequest[] = [
        {
            kind: 'client_tool',
            request: {
                clientToolCalls: [{ id: 'tool-1', name: 'browser_test', args: {} }]
            }
        }
    ]
    const interaction = Object.assign(new GroupInteraction(), {
        id: randomUUID(),
        groupId: group.id,
        participantId: member.id,
        assignedUserId: actor.subjectId,
        recipientId: receipt.id,
        runId: receipt.executionId,
        status: 'pending',
        payload: requests,
        createdAt: new Date('2026-10-09T01:00:00Z')
    })
    const manager = {
        findOne: jest.fn(async (entity: unknown, options: { where: { assignedUserId?: string } }) => {
            if (entity === ChatConversation) return group
            if (entity === GroupInteraction)
                return options.where.assignedUserId === interaction.assignedUserId ? interaction : null
            if (entity === ChatConversationThread) return thread
            if (entity === GroupMessageRecipient) return receipt
            throw new Error('Unexpected entity')
        }),
        findOneBy: jest.fn(async (entity: unknown) => {
            if (entity === GroupParticipant) return member.active ? member : null
            if (entity === ChatConversationThread) return thread
            throw new Error('Unexpected entity')
        }),
        save: jest.fn().mockResolvedValue(undefined),
        increment: jest.fn().mockResolvedValue(undefined)
    }
    const builder = {
        insert: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        orIgnore: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue(undefined)
    }
    const outbox = { flush: jest.fn().mockResolvedValue(undefined) }
    const access = { authorize: jest.fn().mockResolvedValue({ actor }) }
    let committed = false
    const transaction = jest.fn(async (work: (value: typeof manager) => Promise<unknown>) => {
        committed = false
        const result = await work(manager)
        committed = true
        return result
    })
    const module = await Test.createTestingModule({
        providers: [
            GroupInteractionsService,
            {
                provide: DataSource,
                useValue: { transaction, getRepository: () => ({ createQueryBuilder: () => builder }) }
            },
            { provide: GroupAccessService, useValue: access },
            { provide: GroupOutboxService, useValue: outbox }
        ]
    }).compile()
    return {
        service: module.get(GroupInteractionsService),
        group,
        actor,
        member,
        thread,
        receipt,
        interaction,
        manager,
        builder,
        outbox,
        access,
        committed: () => committed
    }
}

const toolResponse = (claimId: string): GroupInteractionResponse => ({
    claimId,
    toolMessages: [{ tool_call_id: 'tool-1', name: 'browser_test', content: 'ok' }]
})

describe('group private interaction ownership', () => {
    it('discloses requests only to the assigned human and permits retries from the winning tab', async () => {
        const { service, group, actor, access, interaction, manager } = await fixture()
        const claimId = randomUUID()
        access.authorize.mockResolvedValueOnce({ actor: { ...actor, subjectId: randomUUID() } })
        await expect(service.claim(group.id, interaction.id, claimId)).rejects.toMatchObject({ status: 403 })
        expect(manager.save).not.toHaveBeenCalled()
        const result = await service.claim(group.id, interaction.id, claimId)
        expect(result).toEqual({ id: interaction.id, claimId, requests: interaction.payload })
        await expect(service.claim(group.id, interaction.id, claimId)).resolves.toEqual(result)
        await expect(service.claim(group.id, interaction.id, randomUUID())).rejects.toMatchObject({ status: 409 })
        expect(interaction.claimedBy).toBe(actor.subjectId)
    })

    it.each(['removed', 'running', 'canceled', 'missing'] as const)(
        'rejects a stale claim when its runtime is %s',
        async (state) => {
            const { service, group, member, thread, interaction, manager } = await fixture()
            if (state === 'removed') member.active = false
            if (state === 'running') thread.status = 'busy'
            if (state === 'canceled') thread.runtimeContinuationBlockedAt = interaction.createdAt
            if (state === 'missing') manager.findOneBy.mockResolvedValueOnce(member).mockResolvedValueOnce(null)
            await expect(service.claim(group.id, interaction.id, randomUUID())).rejects.toMatchObject({
                status: state === 'removed' ? 403 : 409
            })
            expect(manager.save).not.toHaveBeenCalled()
        }
    )

    it('persists the human actor and resumes after commit without consuming duplicate responses twice', async () => {
        const { service, group, actor, receipt, interaction, manager, outbox, committed } = await fixture()
        const claimId = randomUUID()
        await service.claim(group.id, interaction.id, claimId)
        manager.save.mockClear()
        outbox.flush.mockImplementation(async () => {
            expect(committed()).toBe(true)
        })
        await service.respond(group.id, interaction.id, toolResponse(claimId))
        expect(receipt.status).toBe('pending')
        expect(receipt.control).toEqual({
            actorId: actor.subjectId,
            decision: {
                type: 'confirm',
                payload: { toolMessages: toolResponse(claimId).toolMessages }
            }
        })
        expect(interaction.status).toBe('completed')
        expect(manager.save).toHaveBeenCalledTimes(2)
        await service.respond(group.id, interaction.id, toolResponse(claimId))
        expect(manager.save).toHaveBeenCalledTimes(2)
        expect(outbox.flush).toHaveBeenCalledWith(group.id)
    })

    it('rejects a different actor or claim ID before accepting a response', async () => {
        const { service, group, actor, access, interaction, outbox } = await fixture()
        const claimId = randomUUID()
        await service.claim(group.id, interaction.id, claimId)
        await expect(service.respond(group.id, interaction.id, toolResponse(randomUUID()))).rejects.toMatchObject({
            status: 403
        })
        access.authorize.mockResolvedValueOnce({ actor: { ...actor, subjectId: randomUUID() } })
        await expect(service.respond(group.id, interaction.id, toolResponse(claimId))).rejects.toMatchObject({
            status: 403
        })
        expect(outbox.flush).not.toHaveBeenCalled()
    })

    it.each(['missing', 'duplicate', 'id', 'name'] as const)(
        'rejects %s tool results without resuming',
        async (invalid) => {
            const { service, group, interaction, outbox } = await fixture()
            const claimId = randomUUID()
            await service.claim(group.id, interaction.id, claimId)
            const response = toolResponse(claimId)
            if (invalid === 'missing') response.toolMessages = []
            if (invalid === 'duplicate') {
                interaction.payload = [
                    {
                        kind: 'client_tool',
                        request: {
                            clientToolCalls: [
                                { id: 'tool-1', name: 'browser_test', args: {} },
                                { id: 'tool-2', name: 'browser_test', args: {} }
                            ]
                        }
                    }
                ]
                response.toolMessages.push({ ...response.toolMessages[0] })
            }
            if (invalid === 'id') response.toolMessages[0].tool_call_id = 'spoof'
            if (invalid === 'name') response.toolMessages[0].name = 'different_tool'
            await expect(service.respond(group.id, interaction.id, response)).rejects.toMatchObject({ status: 400 })
            expect(outbox.flush).not.toHaveBeenCalled()
        }
    )

    it('accepts only configured approval decisions and edits of the original action', async () => {
        const { service, group, interaction, outbox, receipt } = await fixture()
        const claimId = randomUUID()
        const requests: GroupInteractionRequest[] = [
            {
                kind: 'approval',
                request: {
                    actionRequests: [{ name: 'publish', args: {} }],
                    reviewConfigs: [{ actionName: 'publish', allowedDecisions: ['approve', 'edit'] }]
                }
            }
        ]
        interaction.payload = requests
        await service.claim(group.id, interaction.id, claimId)
        await expect(
            service.respond(group.id, interaction.id, { claimId, decisions: [{ type: 'reject' }] })
        ).rejects.toMatchObject({ status: 400 })
        await expect(
            service.respond(group.id, interaction.id, {
                claimId,
                decisions: [{ type: 'edit', editedAction: { name: 'other', args: {} } }]
            })
        ).rejects.toMatchObject({ status: 400 })
        expect(outbox.flush).not.toHaveBeenCalled()
        const decisions: GroupInteractionResponse['decisions'] = [
            { type: 'edit', editedAction: { name: 'publish', args: { title: 'reviewed' } } }
        ]
        await service.respond(group.id, interaction.id, { claimId, decisions })
        expect(receipt.control.decision).toEqual({ type: 'confirm', payload: { decisions } })
    })

    it('rechecks cancellation after a claim before resuming execution', async () => {
        const { service, group, interaction, thread, outbox } = await fixture()
        const claimId = randomUUID()
        await service.claim(group.id, interaction.id, claimId)
        thread.runtimeContinuationBlockedAt = interaction.createdAt
        await expect(service.respond(group.id, interaction.id, toolResponse(claimId))).rejects.toMatchObject({
            status: 409
        })
        expect(outbox.flush).not.toHaveBeenCalled()
    })

    it('registers supported interrupts with stable identity for replay within the same run', async () => {
        const { service, receipt, member, actor, builder } = await fixture()
        const operation: LangGraphInterruptPayload = {
            tasks: [
                {
                    id: 'task',
                    name: 'agent',
                    path: [],
                    interrupts: [
                        {
                            id: 'interrupt-1',
                            value: { clientToolCalls: [{ id: 'tool-1', name: 'browser_test', args: {} }] }
                        }
                    ]
                }
            ]
        }
        await service.register(receipt, member, actor.subjectId, operation)
        await service.register(receipt, member, actor.subjectId, operation)
        expect(builder.values).toHaveBeenCalledTimes(2)
        expect(builder.values.mock.calls[0][0]).toEqual(builder.values.mock.calls[1][0])
        expect(builder.values.mock.calls[0][0]).toMatchObject({
            assignedUserId: actor.subjectId,
            runId: receipt.executionId,
            recipientId: receipt.id
        })
        expect(builder.orIgnore).toHaveBeenCalledTimes(2)
    })
})

describe('group interaction schemas', () => {
    it('rejects malformed claims, extra authority fields and oversized responses', () => {
        expect(groupClaimSchema.safeParse({ claimId: 'invalid' }).success).toBe(false)
        expect(groupClaimSchema.safeParse({ claimId: randomUUID(), userId: randomUUID() }).success).toBe(false)
        expect(
            groupInteractionResponseSchema.safeParse({ ...toolResponse(randomUUID()), actorId: randomUUID() }).success
        ).toBe(false)
        expect(
            groupInteractionResponseSchema.safeParse({
                claimId: randomUUID(),
                toolMessages: [{ tool_call_id: 't', content: 'x'.repeat(128001) }]
            }).success
        ).toBe(false)
        expect(() => parseGroupInteractionRequests([{ kind: 'client_tool', request: null }])).toThrow()
    })
})
