import { randomUUID } from 'node:crypto'
import { DataSource } from 'typeorm'
import { ChatConversation } from '../../../chat-conversation/conversation.entity'
import { ChatMessage } from '../../../chat-message/chat-message.entity'
import { XpertAgentExecution } from '../../../xpert-agent-execution/agent-execution.entity'
import { GroupMessagesService } from '../../group-messages.service'
import { GroupMessageRecipient, GroupParticipant } from '../../group.entity'
import { GroupProjectService } from '../group-project.service'

type Fixture = {
    db: DataSource
    messages: GroupMessagesService
    projects: GroupProjectService
    group: ChatConversation
    c: GroupParticipant
    e: GroupParticipant
    requireProject: () => void
}

export function groupProjectPreflightCases(fixture: () => Fixture) {
    const request = (recipientIds: string[]) => ({
        intent: 'request' as const,
        recipientIds,
        text: 'Review the monthly figures',
        clientMessageId: randomUUID()
    })
    it('rejects all missing Project recipients before saving any message, receipt or revision', async () => {
        const f = fixture()
        f.requireProject()
        await expect(f.messages.send(f.group.id, request([f.c.id, f.e.id]))).rejects.toMatchObject({
            status: 400,
            response: {
                code: 'GROUP_PROJECT_REQUIRED',
                groupId: f.group.id,
                participantIds: expect.arrayContaining([f.c.id, f.e.id])
            }
        })
        expect(await f.db.getRepository(ChatMessage).count()).toBe(0)
        expect(await f.db.getRepository(GroupMessageRecipient).count()).toBe(0)
        expect(await f.db.getRepository(XpertAgentExecution).count()).toBe(0)
        expect((await f.db.getRepository(ChatConversation).findOneByOrFail({ id: f.group.id })).revision).toBe(0)
    })
    it('reports only unbound recipients and allows the same rejected request after binding', async () => {
        const f = fixture()
        f.requireProject()
        const projectId = randomUUID()
        await f.projects.set(f.group.id, { project: { mode: 'existing', projectId }, participantIds: [f.c.id] })
        const input = request([f.c.id, f.e.id])
        await expect(f.messages.send(f.group.id, input)).rejects.toMatchObject({
            response: { code: 'GROUP_PROJECT_REQUIRED', participantIds: [f.e.id] }
        })
        expect(await f.db.getRepository(ChatMessage).count()).toBe(0)
        await f.projects.set(f.group.id, { project: { mode: 'existing', projectId }, participantIds: [f.c.id, f.e.id] })
        const sent = await f.messages.send(f.group.id, input)
        expect((await f.messages.send(f.group.id, input)).id).toBe(sent.id)
        expect(await f.db.getRepository(ChatMessage).count()).toBe(1)
        expect(await f.db.getRepository(GroupMessageRecipient).count()).toBe(2)
    })
    it('returns an already accepted message on retry even if the Assistant now requires a Project', async () => {
        const f = fixture()
        const input = request([f.c.id])
        const sent = await f.messages.send(f.group.id, input)
        f.requireProject()
        expect((await f.messages.send(f.group.id, input)).id).toBe(sent.id)
        expect(await f.db.getRepository(ChatMessage).count()).toBe(1)
    })
}
