import { DataSource } from 'typeorm'
import { User } from '@xpert-ai/server-core'
import { Xpert } from '../xpert/xpert.entity'
import { ChatConversation } from '../chat-conversation/conversation.entity'
import { GroupParticipant } from './group.entity'
import { publicMembers } from './group-members.service'

describe('group public member avatars', () => {
    const db = new DataSource({ type: 'postgres' })
    const group = Object.assign(new ChatConversation(), { tenantId: 'tenant', organizationId: 'org' })
    const members = [
        Object.assign(new GroupParticipant(), {
            id: 'a',
            subjectId: 'user',
            kind: 'user',
            name: 'A',
            active: true,
            role: 'owner'
        }),
        Object.assign(new GroupParticipant(), {
            id: 'c',
            subjectId: 'assistant',
            kind: 'assistant',
            name: 'C',
            active: true,
            role: 'member',
            runtimeThreadId: 'private-thread'
        })
    ]
    afterEach(() => jest.restoreAllMocks())

    it('reads only public profile fields in the authorized group scope', async () => {
        const users = jest.spyOn(db.getRepository(User), 'find').mockResolvedValue([
            Object.assign(new User(), {
                id: 'user',
                imageUrl: 'https://example.com/user.png',
                hash: 'private-hash'
            })
        ])
        const assistants = jest
            .spyOn(db.getRepository(Xpert), 'find')
            .mockResolvedValue([
                Object.assign(new Xpert(), { id: 'assistant', avatar: { url: 'https://example.com/assistant.png' } })
            ])
        const result = await publicMembers(db, group, members)
        expect(users).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ tenantId: 'tenant' }),
                select: { id: true, imageUrl: true }
            })
        )
        expect(assistants).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ tenantId: 'tenant', organizationId: 'org' }),
                select: { id: true, avatar: true }
            })
        )
        expect(result.map((member) => member.avatar?.url)).toEqual([
            'https://example.com/user.png',
            'https://example.com/assistant.png'
        ])
        expect(JSON.stringify(result)).not.toContain('private-')
    })

    it('keeps members without profile images available for the normal avatar fallback', async () => {
        jest.spyOn(db.getRepository(User), 'find').mockResolvedValue([])
        jest.spyOn(db.getRepository(Xpert), 'find').mockResolvedValue([])
        const result = await publicMembers(db, group, members)
        expect(result.map((member) => [member.id, member.name, member.avatar])).toEqual([
            ['a', 'A', null],
            ['c', 'C', null]
        ])
    })
})
