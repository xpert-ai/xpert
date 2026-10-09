import { Test } from '@nestjs/testing'
import { CommandBus } from '@nestjs/cqrs'
import { CancelConversationCommand } from '@xpert-ai/plugin-sdk'
import { randomUUID } from 'node:crypto'
import { DataSource, In } from 'typeorm'
import { ChatConversation } from '../chat-conversation/conversation.entity'
import { ChatConversationThread } from '../chat-conversation/conversation-thread.entity'
import { ThreadRunControlService } from '../chat-conversation/thread-run-control.service'
import { ChatMessage } from '../chat-message/chat-message.entity'
import { GroupAccessService } from './group-access.service'
import { GroupControlService } from './group-control.service'
import { GroupOutboxService } from './group-outbox.service'
import { GroupInteraction, GroupMessageRecipient, GroupParticipant } from './group.entity'
import { hasGroupRuntime, isGroupRuntime } from './group-runtime-context'
import { GroupControlInput, groupControlSchema } from './group.schema'

async function fixture() {
    const group = Object.assign(new ChatConversation(), { id: randomUUID() })
    const actor = Object.assign(new GroupParticipant(), { id: randomUUID(), subjectId: randomUUID(), role: 'member' })
    const member = Object.assign(new GroupParticipant(), {
        id: randomUUID(),
        groupId: group.id,
        subjectId: randomUUID(),
        runtimeThreadId: randomUUID(),
        runtimeConversationId: randomUUID()
    })
    const runId = randomUUID()
    const thread = Object.assign(new ChatConversationThread(), {
        id: randomUUID(),
        threadId: member.runtimeThreadId,
        status: 'paused',
        runControl: { executionId: runId, state: 'paused', pauseId: randomUUID() }
    })
    const lockedThread = Object.assign(new ChatConversationThread(), thread, { runControl: { ...thread.runControl } })
    const message = Object.assign(new ChatMessage(), {
        id: randomUUID(),
        conversationId: group.id,
        groupCommunication: { senderId: actor.id }
    })
    const receipt = Object.assign(new GroupMessageRecipient(), {
        id: randomUUID(),
        groupId: group.id,
        messageId: message.id,
        participantId: member.id,
        executionId: runId,
        status: 'blocked',
        phase: 'started'
    })
    const members = { findOneBy: jest.fn().mockResolvedValue(member) }
    const threads = { findOneBy: jest.fn().mockResolvedValue(thread) }
    const receipts = { update: jest.fn().mockResolvedValue(undefined) }
    const interactions = {
        findOneBy: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue(undefined)
    }
    const groups = { increment: jest.fn().mockResolvedValue(undefined) }
    const manager = {
        findOne: jest.fn(async (entity: unknown, options: { where: { status?: string } }) => {
            if (entity === ChatConversation) return group
            if (entity === ChatConversationThread) return lockedThread
            if (entity === GroupMessageRecipient)
                return !options.where.status || options.where.status === receipt.status ? receipt : null
            throw new Error('Unexpected entity')
        }),
        findOneBy: jest.fn(async (entity: unknown) => {
            if (entity === GroupParticipant) return member
            if (entity === ChatMessage) return message
            throw new Error('Unexpected entity')
        }),
        save: jest.fn().mockResolvedValue(undefined),
        increment: jest.fn().mockResolvedValue(undefined)
    }
    let committed = false
    const transaction = jest.fn(async (work: (value: typeof manager) => Promise<unknown>) => {
        committed = false
        const result = await work(manager)
        committed = true
        return result
    })
    const access = {
        authorize: jest.fn().mockResolvedValue({ actor }),
        assistant: jest.fn().mockResolvedValue(undefined)
    }
    const control = { requestPause: jest.fn().mockResolvedValue(undefined) }
    const commands = { execute: jest.fn().mockResolvedValue(undefined) }
    const outbox = { flush: jest.fn().mockResolvedValue(undefined) }
    const module = await Test.createTestingModule({
        providers: [
            GroupControlService,
            {
                provide: DataSource,
                useValue: {
                    transaction,
                    getRepository: (entity: unknown) => {
                        if (entity === GroupParticipant) return members
                        if (entity === ChatConversationThread) return threads
                        if (entity === GroupMessageRecipient) return receipts
                        if (entity === GroupInteraction) return interactions
                        if (entity === ChatConversation) return groups
                        throw new Error('Unexpected repository')
                    }
                }
            },
            { provide: GroupAccessService, useValue: access },
            { provide: ThreadRunControlService, useValue: control },
            { provide: CommandBus, useValue: commands },
            { provide: GroupOutboxService, useValue: outbox }
        ]
    }).compile()
    return {
        service: module.get(GroupControlService),
        group,
        actor,
        member,
        runId,
        thread,
        lockedThread,
        message,
        receipt,
        members,
        threads,
        receipts,
        interactions,
        groups,
        manager,
        transaction,
        access,
        control,
        commands,
        outbox,
        committed: () => committed
    }
}

describe('group runtime controls', () => {
    it('delegates pause to the existing control service after member and Assistant authorization', async () => {
        const { service, group, member, runId, members, access, control, groups, commands, outbox } = await fixture()
        await service.act(group.id, member.id, { action: 'pause', runId })
        expect(members.findOneBy).toHaveBeenCalledWith({
            id: member.id,
            groupId: group.id,
            active: true,
            kind: 'assistant'
        })
        expect(access.assistant).toHaveBeenCalledWith(member.subjectId)
        expect(control.requestPause).toHaveBeenCalledWith(member.runtimeThreadId, runId)
        expect(groups.increment).toHaveBeenCalledWith({ id: group.id }, 'revision', 1)
        expect(commands.execute).not.toHaveBeenCalled()
        expect(outbox.flush).not.toHaveBeenCalled()
    })

    it.each(['membership', 'assistant', 'thread', 'run'] as const)(
        'rejects an invalid %s before applying controls',
        async (invalid) => {
            const { service, group, member, runId, members, threads, access, control, commands, outbox } =
                await fixture()
            if (invalid === 'membership') members.findOneBy.mockResolvedValue(null)
            if (invalid === 'assistant') access.assistant.mockRejectedValue({ status: 403 })
            if (invalid === 'thread') threads.findOneBy.mockResolvedValue(null)
            await expect(
                service.act(group.id, member.id, { action: 'pause', runId: invalid === 'run' ? randomUUID() : runId })
            ).rejects.toMatchObject({ status: ['membership', 'assistant'].includes(invalid) ? 403 : 409 })
            expect(control.requestPause).not.toHaveBeenCalled()
            expect(commands.execute).not.toHaveBeenCalled()
            expect(outbox.flush).not.toHaveBeenCalled()
        }
    )

    it('cancels through the existing command and clears only the target member’s queued work', async () => {
        const { service, group, member, runId, commands, receipts, interactions } = await fixture()
        commands.execute.mockImplementation(async (command: CancelConversationCommand) => {
            expect(command.input).toEqual({ threadId: member.runtimeThreadId, executionId: runId })
            expect(isGroupRuntime(member.runtimeConversationId)).toBe(true)
        })
        await service.act(group.id, member.id, { action: 'cancel', runId })
        expect(receipts.update).toHaveBeenCalledWith(
            { groupId: group.id, participantId: member.id, status: In(['pending', 'starting', 'steering', 'blocked']) },
            { status: 'canceled', control: null }
        )
        expect(interactions.update).toHaveBeenCalledWith(
            { groupId: group.id, participantId: member.id, runId, status: In(['pending', 'claimed']) },
            { status: 'canceled' }
        )
        expect(hasGroupRuntime()).toBe(false)
    })

    it('allows cancellation of an interrupted run only when a matching interaction remains active', async () => {
        const { service, group, member, runId, thread, interactions, commands } = await fixture()
        thread.status = 'interrupted'
        thread.runControl = null
        await expect(service.act(group.id, member.id, { action: 'cancel', runId })).rejects.toMatchObject({
            status: 409
        })
        interactions.findOneBy.mockResolvedValue({ runId })
        await service.act(group.id, member.id, { action: 'cancel', runId })
        expect(interactions.findOneBy).toHaveBeenCalledWith({
            groupId: group.id,
            participantId: member.id,
            runId,
            status: In(['pending', 'claimed'])
        })
        expect(commands.execute).toHaveBeenCalledTimes(1)
    })

    it('does not mark deliveries canceled when the runtime command fails and clears its context', async () => {
        const { service, group, member, runId, commands, receipts, groups } = await fixture()
        commands.execute.mockRejectedValue(new Error('cancel failed'))
        await expect(service.act(group.id, member.id, { action: 'cancel', runId })).rejects.toThrow('cancel failed')
        expect(receipts.update).not.toHaveBeenCalled()
        expect(groups.increment).not.toHaveBeenCalled()
        expect(hasGroupRuntime()).toBe(false)
    })

    it('resumes once with the human actor and pause ID, enqueueing only after commit', async () => {
        const { service, group, member, actor, runId, receipt, lockedThread, outbox, manager, committed } =
            await fixture()
        outbox.flush.mockImplementation(async () => {
            expect(committed()).toBe(true)
        })
        await service.act(group.id, member.id, { action: 'resume', runId })
        expect(receipt.control).toEqual({
            actorId: actor.subjectId,
            pauseId: lockedThread.runControl.pauseId,
            decision: { type: 'confirm' }
        })
        expect(receipt.status).toBe('pending')
        expect(receipt.phase).toBeNull()
        expect(manager.findOne.mock.calls.map(([entity]) => entity)).toEqual([
            ChatConversation,
            ChatConversationThread,
            GroupMessageRecipient
        ])
        await expect(service.act(group.id, member.id, { action: 'resume', runId })).rejects.toMatchObject({
            status: 409
        })
        expect(outbox.flush).toHaveBeenCalledTimes(1)
        expect(manager.save).toHaveBeenCalledTimes(1)
    })

    it.each(['state', 'run', 'pause', 'decision'] as const)('rechecks %s under the resume lock', async (invalid) => {
        const { service, group, member, runId, receipt, lockedThread, manager, outbox } = await fixture()
        if (invalid === 'state') lockedThread.status = 'busy'
        if (invalid === 'run') lockedThread.runControl.executionId = randomUUID()
        if (invalid === 'pause') lockedThread.runControl.pauseId = undefined
        if (invalid === 'decision') receipt.control = { actorId: randomUUID(), decision: { type: 'confirm' } }
        await expect(service.act(group.id, member.id, { action: 'resume', runId })).rejects.toMatchObject({
            status: 409
        })
        expect(manager.save).not.toHaveBeenCalled()
        expect(outbox.flush).not.toHaveBeenCalled()
    })
})

describe('group delivery cancellation', () => {
    it.each(['sender', 'owner'] as const)(
        'allows the %s to cancel a pending receipt using runtime admission lock order',
        async (role) => {
            const { service, group, actor, member, message, receipt, manager, commands } = await fixture()
            receipt.status = 'pending'
            receipt.control = { actorId: actor.subjectId, decision: { type: 'confirm' } }
            if (role === 'owner') {
                actor.role = 'owner'
                message.groupCommunication.senderId = randomUUID()
            }
            await expect(service.cancelDelivery(group.id, message.id, member.id)).resolves.toEqual({ canceled: true })
            expect(manager.findOne.mock.calls.map(([entity]) => entity)).toEqual([
                ChatConversation,
                ChatConversationThread,
                GroupMessageRecipient
            ])
            expect(manager.findOneBy).toHaveBeenCalledWith(ChatMessage, { id: message.id, conversationId: group.id })
            expect(receipt.status).toBe('canceled')
            expect(receipt.control).toBeNull()
            expect(manager.increment).toHaveBeenCalledWith(ChatConversation, { id: group.id }, 'revision', 1)
            expect(commands.execute).not.toHaveBeenCalled()
        }
    )

    it('rejects a different sender before changing a receipt', async () => {
        const { service, group, member, message, manager } = await fixture()
        message.groupCommunication.senderId = randomUUID()
        await expect(service.cancelDelivery(group.id, message.id, member.id)).rejects.toMatchObject({ status: 403 })
        expect(manager.save).not.toHaveBeenCalled()
    })

    it.each(['starting', 'steering', 'consumed', 'canceled'] as const)(
        'does not retract a %s receipt',
        async (status) => {
            const { service, group, member, message, receipt, manager } = await fixture()
            receipt.status = status
            await expect(service.cancelDelivery(group.id, message.id, member.id)).rejects.toMatchObject({ status: 409 })
            expect(manager.save).not.toHaveBeenCalled()
        }
    )
})

describe('group control input', () => {
    it('requires both a supported action and an execution ID without client authority overrides', () => {
        const input: GroupControlInput = { action: 'resume', runId: randomUUID() }
        expect(groupControlSchema.parse(input)).toEqual(input)
        for (const invalid of [
            { runId: input.runId },
            { action: 'pause' },
            { ...input, action: 'restart' },
            { ...input, actorId: randomUUID() }
        ]) {
            expect(groupControlSchema.safeParse(invalid).success).toBe(false)
        }
    })
})
