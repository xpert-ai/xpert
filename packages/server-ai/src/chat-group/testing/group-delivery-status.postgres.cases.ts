import { randomUUID } from 'node:crypto'
import { DataSource } from 'typeorm'
import type { AgentChatDispatchPayload } from '@xpert-ai/plugin-sdk'
import { ChatConversation } from '../../chat-conversation/conversation.entity'
import { ChatMessage } from '../../chat-message/chat-message.entity'
import { GroupMessagesService } from '../group-messages.service'
import { GroupMessageRecipient, GroupParticipant } from '../group.entity'

type Fixture = {
    db: DataSource
    messages: GroupMessagesService
    group: ChatConversation
    a: GroupParticipant
    c: GroupParticipant
    e: GroupParticipant
    prepare: (receipt: GroupMessageRecipient, queue?: string) => Promise<AgentChatDispatchPayload | null>
}

export function groupDeliveryStatusCases(fixture: () => Fixture) {
    async function start(text = 'Please do the task', queue = 'handoff') {
        const f = fixture()
        const message = await f.messages.send(f.group.id, {
            intent: 'request',
            recipientIds: [f.c.id],
            text,
            clientMessageId: randomUUID()
        })
        const receipt = await f.db.getRepository(GroupMessageRecipient).findOneByOrFail({ messageId: message.id })
        await f.prepare(receipt, queue)
        return { ...f, message, receipt }
    }

    function input(f: Awaited<ReturnType<typeof start>>) {
        return f.db.getRepository(ChatMessage).create({
            tenantId: f.group.tenantId,
            organizationId: f.group.organizationId,
            conversationId: f.c.runtimeConversationId,
            createdInThreadId: f.c.runtimeThreadId,
            role: 'human',
            content: 'Private runtime input',
            messageEnvelope: {
                version: 1,
                source: { type: 'user', userId: f.a.subjectId },
                presentation: 'runtime',
                correlation: { messageId: f.receipt.id }
            }
        })
    }

    async function delivery(f: Awaited<ReturnType<typeof start>>) {
        const snapshot = await f.messages.snapshot(f.group.id)
        return snapshot.messages.find((message) => message.id === f.message.id)?.deliveries[0]
    }

    it('acknowledges an accepted runtime input before any output without finalizing the dispatch receipt', async () => {
        const f = await start()
        const before = await f.messages.snapshot(f.group.id)
        expect(before.runs[0].status).toBe('busy')
        expect(await delivery(f)).toEqual({ participantId: f.c.id, status: 'starting' })
        await f.db.getRepository(ChatMessage).save(input(f))

        const after = await f.messages.snapshot(f.group.id)
        expect(after.messages).toHaveLength(1)
        expect(after.messages[0].deliveries).toEqual([{ participantId: f.c.id, status: 'consumed' }])
        expect(after.runs[0].status).toBe('busy')
        expect(after.revision).toBe(before.revision)
        expect(JSON.stringify(after)).not.toContain('Private runtime input')
        expect(await f.db.getRepository(GroupMessageRecipient).findOneByOrFail({ id: f.receipt.id })).toMatchObject({
            status: 'starting',
            phase: 'started'
        })
    })

    it('acknowledges a steer only after consumption, not when it is queued in a busy runtime', async () => {
        await start()
        const f = await start('Additional instructions', 'realtime')
        const queued = input(f)
        queued.followUpStatus = 'pending'
        await f.db.getRepository(ChatMessage).save(queued)
        expect(await delivery(f)).toEqual({ participantId: f.c.id, status: 'steering' })
        await f.db.getRepository(ChatMessage).update(queued.id, { followUpStatus: 'consumed' })
        expect(await delivery(f)).toEqual({ participantId: f.c.id, status: 'consumed' })
        expect((await f.db.getRepository(GroupMessageRecipient).findOneByOrFail({ id: f.receipt.id })).status).toBe(
            'steering'
        )
    })

    it.each(['conversation', 'thread', 'receipt', 'tenant', 'organization', 'role', 'presentation'])(
        'does not acknowledge an input with a different %s binding',
        async (mismatch) => {
            const f = await start()
            const unrelated = input(f)
            if (mismatch === 'conversation') unrelated.conversationId = f.e.runtimeConversationId
            if (mismatch === 'thread') unrelated.createdInThreadId = f.e.runtimeThreadId
            if (mismatch === 'receipt') unrelated.messageEnvelope.correlation.messageId = randomUUID()
            if (mismatch === 'tenant') unrelated.tenantId = randomUUID()
            if (mismatch === 'organization') unrelated.organizationId = randomUUID()
            if (mismatch === 'role') unrelated.role = 'ai'
            if (mismatch === 'presentation') unrelated.messageEnvelope.presentation = 'message'
            await f.db.getRepository(ChatMessage).save(unrelated)
            expect(await delivery(f)).toEqual({ participantId: f.c.id, status: 'starting' })
        }
    )

    it.each(['failed', 'blocked', 'canceled'] as const)(
        'preserves %s status after input acceptance',
        async (status) => {
            const f = await start()
            await f.db.getRepository(ChatMessage).save(input(f))
            await f.db.getRepository(GroupMessageRecipient).update(f.receipt.id, { status })
            expect(await delivery(f)).toEqual({ participantId: f.c.id, status })
        }
    )
}
