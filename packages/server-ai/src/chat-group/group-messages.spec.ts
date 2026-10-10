import { randomUUID } from 'node:crypto'
import { DataSource } from 'typeorm'
import { ChatConversation } from '../chat-conversation/conversation.entity'
import { ChatMessage } from '../chat-message/chat-message.entity'
import { GroupAccessService } from './group-access.service'
import { GroupComposerService } from './group-composer.service'
import { GroupMessagesService, publicMessage } from './group-messages.service'
import { GroupParticipant, GroupMessageRecipient } from './group.entity'

function fixture() {
    const group = Object.assign(new ChatConversation(), { id: randomUUID(), xpertId: randomUUID() })
    const member = (name: string, kind: 'user' | 'assistant', subjectId = randomUUID()) =>
        Object.assign(new GroupParticipant(), {
            id: randomUUID(),
            groupId: group.id,
            name,
            kind,
            subjectId,
            active: true
        })
    const a = member('A', 'user'),
        b = member('B', 'user'),
        c = member('C', 'assistant', group.xpertId),
        e = member('E', 'assistant')
    const db = new DataSource({ type: 'postgres' })
    const access = { authorize: jest.fn().mockResolvedValue({ group, actor: a }), assistant: jest.fn() }
    const composer = { member: jest.fn(), validate: jest.fn() }
    const service = new GroupMessagesService(
        db,
        access as unknown as GroupAccessService,
        composer as unknown as GroupComposerService
    )
    const members = jest.spyOn(db.getRepository(GroupParticipant), 'findBy').mockResolvedValue([a, b, c, e])
    return { group, a, b, c, e, db, access, composer, service, members }
}

describe('group human message routing', () => {
    afterEach(() => jest.restoreAllMocks())
    it('routes plain text to the group xpertId while preserving the authenticated human author', async () => {
        const { service, group, a, c } = fixture()
        const publish = jest.spyOn(service, 'publish').mockResolvedValue(undefined)
        const input = { clientMessageId: randomUUID(), text: 'Hello' }
        await service.submit(group.id, input)
        expect(publish).toHaveBeenCalledWith(group, a, {
            ...input,
            composer: undefined,
            intent: 'request',
            recipientIds: [c.id]
        })
    })
    it('routes explicit mentions to humans or multiple Assistants without adding the default Assistant', async () => {
        const { service, group, b, c, e } = fixture()
        const publish = jest.spyOn(service, 'publish').mockResolvedValue(undefined)
        const clientMessageId = randomUUID()
        await service.submit(group.id, {
            clientMessageId,
            text: '@B Hi',
            mentions: [{ participantId: b.id, start: 0, end: 2 }]
        })
        expect(publish.mock.calls[0][2]).toMatchObject({ recipientIds: [b.id] })
        await service.submit(group.id, {
            clientMessageId,
            text: '@C @E Hi',
            mentions: [
                { participantId: c.id, start: 0, end: 2 },
                { participantId: e.id, start: 3, end: 5 }
            ]
        })
        expect(publish.mock.calls[1][2]).toMatchObject({ recipientIds: [c.id, e.id] })
    })
    it('fails closed when the default Assistant is absent or a mention is unbound', async () => {
        const { service, group, a, b, members } = fixture()
        const publish = jest.spyOn(service, 'publish').mockResolvedValue(undefined)
        members.mockResolvedValue([a, b])
        await expect(service.submit(group.id, { clientMessageId: randomUUID(), text: 'Hi' })).rejects.toMatchObject({
            status: 403
        })
        await expect(service.submit(group.id, { clientMessageId: randomUUID(), text: '@B Hi' })).rejects.toMatchObject({
            status: 400
        })
        expect(publish).not.toHaveBeenCalled()
    })
    it('treats a reply as completion only when the selected recipient is the original sender', async () => {
        const { service, group, a, b, c, db } = fixture()
        const original = Object.assign(new ChatMessage(), {
            id: randomUUID(),
            groupCommunication: {
                intent: 'request',
                senderId: b.id,
                recipientIds: [a.id],
                rootMessageId: randomUUID(),
                rootUserId: b.subjectId,
                hop: 0
            }
        })
        const find = jest.spyOn(db.getRepository(ChatMessage), 'findOneBy').mockResolvedValue(original)
        const publish = jest.spyOn(service, 'publish').mockResolvedValue(undefined)
        const clientMessageId = randomUUID()
        await service.submit(group.id, {
            clientMessageId,
            text: '@B Received',
            replyToMessageId: original.id,
            mentions: [{ participantId: b.id, start: 0, end: 2 }]
        })
        expect(find).toHaveBeenCalledWith({ id: original.id, conversationId: group.id })
        expect(publish.mock.calls[0][2]).toMatchObject({ intent: 'reply', replyToMessageId: original.id })
        await service.submit(group.id, { clientMessageId, text: 'New question', replyToMessageId: original.id })
        expect(publish.mock.calls[1][2]).toMatchObject({ intent: 'request', recipientIds: [c.id] })
    })
})

describe('group publication boundaries', () => {
    afterEach(() => jest.restoreAllMocks())
    it('rejects inactive authors and authors from another group before persistence', async () => {
        const { service, group, a, db } = fixture()
        const transaction = jest.spyOn(db, 'transaction')
        const input = { clientMessageId: randomUUID(), text: 'Hello', intent: 'message' as const, recipientIds: [] }
        a.active = false
        await expect(service.publish(group, a, input)).rejects.toMatchObject({ status: 403 })
        a.active = true
        a.groupId = randomUUID()
        await expect(service.publish(group, a, input)).rejects.toMatchObject({ status: 403 })
        expect(transaction).not.toHaveBeenCalled()
    })
    it('rejects a Composer snapshot for a different recipient before opening a transaction', async () => {
        const { service, group, a, c, e, db, composer } = fixture()
        jest.spyOn(db.getRepository(GroupParticipant), 'findOneBy').mockResolvedValue(c)
        const transaction = jest.spyOn(db, 'transaction')
        await expect(
            service.publish(group, a, {
                clientMessageId: randomUUID(),
                text: 'Hello',
                intent: 'request',
                recipientIds: [c.id],
                composer: { participantId: e.id }
            })
        ).rejects.toMatchObject({ status: 403 })
        expect(composer.validate).not.toHaveBeenCalled()
        expect(transaction).not.toHaveBeenCalled()
    })
    it('projects public participant links and delivery state without private execution IDs', () => {
        const { a, c } = fixture()
        const message = Object.assign(new ChatMessage(), {
            id: randomUUID(),
            sequence: 2,
            content: 'Hello',
            createdAt: new Date(),
            groupPublicationId: 'output:private-run',
            executionId: 'private-run',
            createdInThreadId: 'private-thread',
            groupCommunication: {
                intent: 'message',
                senderId: c.id,
                recipientIds: [a.id],
                rootMessageId: randomUUID(),
                rootUserId: a.subjectId,
                hop: 1
            }
        })
        const receipt = Object.assign(new GroupMessageRecipient(), {
            messageId: message.id,
            participantId: c.id,
            executionId: 'private-run',
            status: 'consumed'
        })
        const projected = publicMessage(message, [
            receipt,
            Object.assign(new GroupMessageRecipient(), { messageId: 'other', participantId: a.id })
        ])
        expect(projected.runtimeParticipantIds).toEqual([c.id])
        expect(projected.deliveries).toEqual([{ participantId: c.id, status: 'consumed' }])
        expect(JSON.stringify(projected)).not.toContain('private-')
    })
})
