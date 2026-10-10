import { Test } from '@nestjs/testing'
import { DataSource } from 'typeorm'
import { randomUUID } from 'node:crypto'
import type { ChatGroupCommunication } from '@xpert-ai/contracts'
import { ChatConversation } from '../chat-conversation/conversation.entity'
import { ChatConversationThread } from '../chat-conversation/conversation-thread.entity'
import { ChatMessage } from '../chat-message/chat-message.entity'
import { GroupAccessService } from './group-access.service'
import { GroupMessagesService } from './group-messages.service'
import { GroupOutboxService } from './group-outbox.service'
import { GroupToolsService } from './group-tools.service'
import { GroupMessageRecipient, GroupParticipant } from './group.entity'

async function fixture() {
    const group = Object.assign(new ChatConversation(), { id: randomUUID() })
    const member = Object.assign(new GroupParticipant(), {
        id: randomUUID(),
        groupId: group.id,
        kind: 'assistant',
        subjectId: randomUUID(),
        runtimeConversationId: randomUUID(),
        runtimeThreadId: randomUUID(),
        active: true
    })
    const human = Object.assign(new GroupParticipant(), {
        id: randomUUID(),
        groupId: group.id,
        kind: 'user',
        subjectId: randomUUID(),
        active: true
    })
    const other = Object.assign(new GroupParticipant(), {
        id: randomUUID(),
        groupId: group.id,
        kind: 'assistant',
        subjectId: randomUUID(),
        active: true
    })
    const root: ChatGroupCommunication = {
        intent: 'request',
        senderId: human.id,
        recipientIds: [member.id],
        rootMessageId: randomUUID(),
        rootUserId: human.subjectId,
        hop: 0
    }
    const original = Object.assign(new ChatMessage(), {
        id: randomUUID(),
        conversationId: group.id,
        groupCommunication: root
    })
    const receipt = Object.assign(new GroupMessageRecipient(), {
        id: randomUUID(),
        groupId: group.id,
        participantId: member.id,
        messageId: original.id,
        executionId: randomUUID()
    })
    const thread = Object.assign(new ChatConversationThread(), {
        status: 'busy',
        runControl: { executionId: receipt.executionId, state: 'running' }
    })
    const threads = { findOneBy: jest.fn().mockResolvedValue(thread) }
    const members = {
        findOneBy: jest.fn(async (where: { id: string }) => {
            return [member, human, other].find((candidate) => candidate.id === where.id && candidate.active) ?? null
        })
    }
    const result = {
        id: randomUUID(),
        deliveries: [{ participantId: other.id, status: 'pending' }],
        privateMetadata: 'hidden'
    }
    let insideRootUser = false
    const access = {
        assistant: jest.fn().mockResolvedValue(undefined),
        withRootUser: jest.fn(async (_group: ChatConversation, _user: string, work: () => Promise<unknown>) => {
            insideRootUser = true
            try {
                return await work()
            } finally {
                insideRootUser = false
            }
        })
    }
    const messages = {
        publish: jest.fn(async () => {
            expect(insideRootUser).toBe(true)
            return result
        })
    }
    const outbox = {
        flush: jest.fn(async () => {
            expect(messages.publish).toHaveBeenCalled()
            expect(insideRootUser).toBe(false)
        })
    }
    const module = await Test.createTestingModule({
        providers: [
            GroupToolsService,
            {
                provide: DataSource,
                useValue: {
                    getRepository: (entity: unknown) => {
                        if (entity === ChatConversationThread) return threads
                        if (entity === GroupParticipant) return members
                        if (entity === ChatConversation) return { findOneByOrFail: async () => group }
                        if (entity === ChatMessage) return { findOneByOrFail: async () => original }
                        throw new Error('Unexpected entity')
                    }
                }
            },
            { provide: GroupAccessService, useValue: access },
            { provide: GroupMessagesService, useValue: messages },
            { provide: GroupOutboxService, useValue: outbox }
        ]
    }).compile()
    const tool = module.get(GroupToolsService).create(receipt, member)
    return {
        tool,
        group,
        member,
        human,
        other,
        root,
        original,
        receipt,
        thread,
        threads,
        members,
        result,
        access,
        messages,
        outbox
    }
}

describe('send_group_message runtime tool', () => {
    it('asks humans and Assistants as the bound member under the initiating human context', async () => {
        const {
            tool,
            group,
            member,
            human,
            other,
            root,
            original,
            receipt,
            threads,
            members,
            result,
            access,
            messages,
            outbox
        } = await fixture()
        const args = { intent: 'request', text: 'Please review', recipientIds: [human.id, other.id] }
        const output = await tool.invoke({ type: 'tool_call', name: tool.name, id: 'call-1', args })
        expect(threads.findOneBy).toHaveBeenCalledWith({
            threadId: member.runtimeThreadId,
            conversationId: member.runtimeConversationId
        })
        expect(members.findOneBy).toHaveBeenCalledWith({ id: other.id, groupId: group.id, active: true })
        expect(access.withRootUser).toHaveBeenCalledWith(group, root.rootUserId, expect.any(Function))
        expect(access.assistant).toHaveBeenCalledTimes(1)
        expect(access.assistant).toHaveBeenCalledWith(other.subjectId)
        expect(messages.publish).toHaveBeenCalledWith(
            group,
            member,
            { ...args, clientMessageId: expect.any(String) },
            root,
            `tool:${receipt.executionId}:call-1`,
            false,
            original.id
        )
        expect(outbox.flush).toHaveBeenCalledWith(group.id)
        expect(output).toMatchObject({
            content: JSON.stringify({ messageId: result.id, deliveries: result.deliveries })
        })
        expect(JSON.stringify(output)).not.toContain('privateMetadata')
    })

    it('leaves reply recipient derivation to the publication service', async () => {
        const { tool, original, messages, access } = await fixture()
        const args = { intent: 'reply', text: 'Reviewed', replyToMessageId: original.id }
        await tool.invoke({ type: 'tool_call', name: tool.name, id: 'reply-1', args })
        expect(messages.publish).toHaveBeenCalledWith(
            expect.anything(),
            expect.anything(),
            { ...args, clientMessageId: expect.any(String) },
            expect.anything(),
            expect.any(String),
            false,
            original.id
        )
        expect(access.assistant).not.toHaveBeenCalled()
    })

    it('publishes progress without recipients and preserves the publication key when a tool call is replayed', async () => {
        const { tool, receipt, messages } = await fixture()
        const call = {
            type: 'tool_call' as const,
            name: tool.name,
            id: 'progress-1',
            args: { intent: 'message', text: 'Working' }
        }
        await tool.invoke(call)
        await tool.invoke(call)
        for (const invocation of messages.publish.mock.calls) {
            expect(invocation).toEqual([
                expect.anything(),
                expect.anything(),
                { intent: 'message', text: 'Working', recipientIds: [], clientMessageId: expect.any(String) },
                expect.anything(),
                `tool:${receipt.executionId}:progress-1`,
                false,
                expect.any(String)
            ])
        }
        expect(messages.publish).toHaveBeenCalledTimes(2)
    })

    it.each(['missing', 'paused', 'new-run'] as const)('denies calls from a %s runtime', async (state) => {
        const { tool, thread, threads, messages, outbox } = await fixture()
        if (state === 'missing') threads.findOneBy.mockResolvedValue(null)
        if (state === 'paused') thread.status = 'paused'
        if (state === 'new-run') thread.runControl.executionId = randomUUID()
        await expect(
            tool.invoke({ type: 'tool_call', name: tool.name, id: 'call-1', args: { intent: 'message', text: 'Hi' } })
        ).rejects.toMatchObject({ status: 403 })
        expect(messages.publish).not.toHaveBeenCalled()
        expect(outbox.flush).not.toHaveBeenCalled()
    })

    it.each(['caller', 'recipient', 'assistant-access', 'root-user'] as const)(
        'rechecks %s access on every invocation',
        async (revoked) => {
            const { tool, member, other, messages, outbox, access } = await fixture()
            if (revoked === 'caller') member.active = false
            if (revoked === 'recipient') other.active = false
            if (revoked === 'assistant-access') access.assistant.mockRejectedValue({ status: 403 })
            if (revoked === 'root-user') access.withRootUser.mockRejectedValue({ status: 403 })
            await expect(
                tool.invoke({
                    type: 'tool_call',
                    name: tool.name,
                    id: 'call-1',
                    args: { intent: 'request', text: 'Hi', recipientIds: [other.id] }
                })
            ).rejects.toMatchObject({ status: 403 })
            expect(messages.publish).not.toHaveBeenCalled()
            expect(outbox.flush).not.toHaveBeenCalled()
        }
    )

    it('requires the runtime tool-call ID instead of accepting a model-generated idempotency key', async () => {
        const { tool, messages, outbox } = await fixture()
        await expect(tool.invoke({ intent: 'message', text: 'Hi' })).rejects.toMatchObject({ status: 400 })
        expect(messages.publish).not.toHaveBeenCalled()
        expect(outbox.flush).not.toHaveBeenCalled()
    })

    it.each(['senderId', 'rootUserId', 'clientMessageId'] as const)(
        'rejects model-supplied %s before entering the runtime',
        async (field) => {
            const { tool, threads, messages } = await fixture()
            await expect(
                tool.invoke({
                    type: 'tool_call',
                    name: tool.name,
                    id: 'call-1',
                    args: { intent: 'message', text: 'Hi', [field]: randomUUID() }
                })
            ).rejects.toThrow()
            expect(threads.findOneBy).not.toHaveBeenCalled()
            expect(messages.publish).not.toHaveBeenCalled()
        }
    )

    it.each(['empty', 'duplicate', 'reply-target', 'whitespace'] as const)(
        'enforces the shared publication contract for %s input',
        async (invalid) => {
            const { tool, other, original, messages, outbox } = await fixture()
            const args =
                invalid === 'reply-target'
                    ? { intent: 'reply', text: 'Hi', replyToMessageId: original.id, recipientIds: [other.id] }
                    : {
                          intent: 'request',
                          text: invalid === 'whitespace' ? ' ' : 'Hi',
                          recipientIds:
                              invalid === 'empty' ? [] : invalid === 'duplicate' ? [other.id, other.id] : [other.id]
                      }
            await expect(tool.invoke({ type: 'tool_call', name: tool.name, id: 'call-1', args })).rejects.toThrow()
            expect(messages.publish).not.toHaveBeenCalled()
            expect(outbox.flush).not.toHaveBeenCalled()
        }
    )

    it('does not dispatch when publication fails', async () => {
        const { tool, messages, outbox } = await fixture()
        messages.publish.mockRejectedValue(new Error('publication failed'))
        await expect(
            tool.invoke({ type: 'tool_call', name: tool.name, id: 'call-1', args: { intent: 'message', text: 'Hi' } })
        ).rejects.toThrow('publication failed')
        expect(outbox.flush).not.toHaveBeenCalled()
    })
})
