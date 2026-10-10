import { Test } from '@nestjs/testing'
import { CommandBus } from '@nestjs/cqrs'
import { DataSource } from 'typeorm'
import { randomUUID } from 'node:crypto'
import { AGENT_CHAT_DISPATCH_MESSAGE_TYPE } from '@xpert-ai/plugin-sdk'
import { HandoffQueueService } from '../handoff/message-queue.service'
import { HandoffOutboxAdapters } from '../handoff/outbox-adapters.service'
import { ChatConversation } from '../chat-conversation/conversation.entity'
import { ChatConversationThread } from '../chat-conversation/conversation-thread.entity'
import { GroupMessageRecipient, GroupParticipant } from './group.entity'
import { FinishGroupChatCommand } from './group-dispatch.commands'
import { GROUP_MESSAGE_TYPE, GroupMessageProcessor, GroupOutboxService } from './group-outbox.service'

async function fixture() {
    const row = Object.assign(new GroupMessageRecipient(), {
        id: randomUUID(),
        tenantId: randomUUID(),
        organizationId: randomUUID(),
        groupId: randomUUID(),
        participantId: randomUUID(),
        messageId: randomUUID(),
        status: 'pending',
        wake: true,
        attempts: 0
    })
    const member = Object.assign(new GroupParticipant(), {
        id: row.participantId,
        groupId: row.groupId,
        kind: 'assistant',
        active: true,
        subjectId: randomUUID(),
        runtimeConversationId: randomUUID(),
        runtimeThreadId: randomUUID()
    })
    const builder = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 })
    }
    const receipts = {
        find: jest.fn().mockResolvedValue([]),
        findBy: jest.fn().mockResolvedValue([row]),
        findOneBy: jest.fn().mockResolvedValue(row),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
        createQueryBuilder: () => builder
    }
    const members = { findOneBy: jest.fn().mockResolvedValue(member) }
    const threads = { findOneBy: jest.fn().mockResolvedValue({ status: 'idle' }) }
    const groups = { increment: jest.fn().mockResolvedValue({ affected: 1 }) }
    const queue = { enqueue: jest.fn().mockResolvedValue(undefined) }
    const commands = { execute: jest.fn().mockResolvedValue(undefined) }
    const adapters = new HandoffOutboxAdapters()
    const module = await Test.createTestingModule({
        providers: [
            GroupOutboxService,
            GroupMessageProcessor,
            {
                provide: DataSource,
                useValue: {
                    getRepository: (entity: unknown) => {
                        if (entity === GroupMessageRecipient) return receipts
                        if (entity === GroupParticipant) return members
                        if (entity === ChatConversationThread) return threads
                        if (entity === ChatConversation) return groups
                        throw new Error('Unexpected repository')
                    }
                }
            },
            { provide: HandoffQueueService, useValue: queue },
            { provide: CommandBus, useValue: commands },
            { provide: HandoffOutboxAdapters, useValue: adapters }
        ]
    }).compile()
    return {
        row,
        member,
        receipts,
        members,
        threads,
        groups,
        builder,
        queue,
        commands,
        adapters,
        service: module.get(GroupOutboxService),
        processor: module.get(GroupMessageProcessor)
    }
}

describe('group outbox shared transport', () => {
    afterEach(() => {
        jest.restoreAllMocks()
        jest.useRealTimers()
    })

    it.each(['idle', 'busy'])(
        'routes a %s runtime through common chat dispatch with a stable receipt identity',
        async (status) => {
            const { service, row, member, receipts, threads, queue } = await fixture()
            threads.findOneBy.mockResolvedValue({ status })
            await service.route(row.id, row.tenantId)
            expect(receipts.findOneBy).toHaveBeenCalledWith({
                id: row.id,
                tenantId: row.tenantId,
                status: 'pending',
                wake: true
            })
            expect(queue.enqueue).toHaveBeenCalledWith(
                expect.objectContaining({
                    id: `group:dispatch:${row.id}`,
                    type: AGENT_CHAT_DISPATCH_MESSAGE_TYPE,
                    tenantId: row.tenantId,
                    businessKey: row.groupId,
                    payload: {
                        request: {
                            action: 'send',
                            conversationId: member.runtimeConversationId,
                            message: { input: { input: '' } }
                        },
                        options: { xpertId: member.subjectId, groupDeliveryId: row.id },
                        callback: { messageType: 'agent.chat_callback.noop.v1', events: 'lifecycle' }
                    },
                    headers: {
                        organizationId: row.organizationId,
                        handoffQueue: status === 'busy' ? 'realtime' : 'handoff',
                        policyTimeoutMs: '3600000'
                    }
                })
            )
        }
    )

    it('ignores stale or foreign-tenant receipts and blocks removed recipients', async () => {
        const { service, row, receipts, members, queue } = await fixture()
        receipts.findOneBy.mockResolvedValueOnce(null)
        await service.route(row.id, 'another-tenant')
        expect(members.findOneBy).not.toHaveBeenCalled()
        members.findOneBy.mockResolvedValueOnce(null)
        await service.route(row.id, row.tenantId)
        expect(members.findOneBy).toHaveBeenCalledWith({ id: row.participantId, groupId: row.groupId, active: true })
        expect(receipts.update).toHaveBeenCalledWith({ id: row.id }, { status: 'blocked', error: 'member_removed' })
        expect(queue.enqueue).not.toHaveBeenCalled()
    })

    it('requires an acquired lease and does not treat enqueue success as receipt consumption', async () => {
        jest.useFakeTimers()
        const { service, row, receipts, builder, queue } = await fixture()
        builder.execute.mockResolvedValueOnce({ affected: 0 })
        await service.flush(row.groupId)
        expect(queue.enqueue).not.toHaveBeenCalled()
        await service.flush(row.groupId)
        expect(queue.enqueue).toHaveBeenCalledWith(
            expect.objectContaining({
                id: `group:${row.id}`,
                type: GROUP_MESSAGE_TYPE,
                payload: { recipientId: row.id }
            })
        )
        expect(receipts.update.mock.calls).toEqual([
            [{ id: row.id, leaseToken: expect.any(String) }, { nextAttemptAt: new Date(Date.now() + 30_000) }],
            [
                { id: row.id, leaseToken: expect.any(String) },
                { leaseToken: null, leaseUntil: null }
            ]
        ])
        expect(receipts.update.mock.calls[0][0].leaseToken).toBe(receipts.update.mock.calls[1][0].leaseToken)
    })

    it.each([0, 9])(
        'retains failed transport receipts with bounded retries (previous attempts: %i)',
        async (attempts) => {
            jest.useFakeTimers()
            const { service, row, receipts, groups, queue } = await fixture()
            row.attempts = attempts
            queue.enqueue.mockRejectedValue(new Error('transport unavailable'))
            await service.flush(row.groupId)
            expect(receipts.update).toHaveBeenCalledWith(
                { id: row.id, leaseToken: expect.any(String), status: 'pending' },
                {
                    status: attempts === 9 ? 'failed' : 'pending',
                    error: 'transport_unavailable',
                    nextAttemptAt: new Date(Date.now() + (attempts === 9 ? 300_000 : 5000))
                }
            )
            expect(receipts.update).toHaveBeenLastCalledWith(
                { id: row.id, leaseToken: expect.any(String) },
                { leaseToken: null, leaseUntil: null }
            )
            expect(groups.increment).toHaveBeenCalledTimes(attempts === 9 ? 1 : 0)
        }
    )

    it('recovers other in-flight receipts even if one reconciliation fails', async () => {
        const { service, row, receipts, commands } = await fixture()
        const other = Object.assign(new GroupMessageRecipient(), row, { id: randomUUID(), status: 'steering' })
        receipts.find.mockResolvedValueOnce([row, other]).mockResolvedValueOnce([])
        commands.execute.mockRejectedValueOnce(new Error('temporarily unavailable'))
        await service.reconcile()
        expect(commands.execute.mock.calls).toEqual([
            [new FinishGroupChatCommand(row.id)],
            [new FinishGroupChatCommand(other.id)]
        ])
    })

    it('unregisters on shutdown and rejects malformed external jobs before routing', async () => {
        const { service, processor, row, adapters, receipts } = await fixture()
        const reconcile = jest.spyOn(service, 'reconcile').mockResolvedValue(undefined)
        service.onModuleInit()
        await adapters.reconcile()
        expect(reconcile).toHaveBeenCalledTimes(1)
        service.onModuleDestroy()
        await adapters.reconcile()
        expect(reconcile).toHaveBeenCalledTimes(1)
        const job = service.message(row)
        expect(() => processor.process({ ...job, payload: { recipientId: 'invalid' } })).toThrow()
        expect(receipts.findOneBy).not.toHaveBeenCalled()
        await processor.process(job)
        expect(receipts.findOneBy).toHaveBeenCalledWith({
            id: row.id,
            tenantId: row.tenantId,
            status: 'pending',
            wake: true
        })
    })
})
