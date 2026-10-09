import { DataSource, In, SelectQueryBuilder } from 'typeorm'
import { User, UserOrganization } from '@xpert-ai/server-core'
import { Xpert } from '../xpert/xpert.entity'
import { ChatConversation } from '../chat-conversation/conversation.entity'
import { ChatMessage } from '../chat-message/chat-message.entity'
import { GroupParticipant } from './group.entity'
import { GroupCatalogService } from './group-catalog.service'
import { GroupAccessService } from './group-access.service'
import { PublishedXpertAccessService } from '../xpert/published-xpert-access.service'

describe('group sidebar summaries', () => {
    const db = new DataSource({ type: 'postgres' })
    afterEach(() => jest.restoreAllMocks())
    it('returns scoped public avatars, latest activity and an explicit group discriminator without private runtime IDs', async () => {
        const user = jest.fn().mockResolvedValue(undefined)
        const service = new GroupCatalogService(
            db,
            {
                scope: () => ({ tenantId: 'tenant', organizationId: 'org', userId: 'me' }),
                user
            } as unknown as GroupAccessService,
            {} as PublishedXpertAccessService
        )
        const member = Object.assign(new GroupParticipant(), {
            id: 'member',
            groupId: 'group',
            subjectId: 'me',
            kind: 'user',
            name: 'Me',
            active: true,
            readSequence: 1,
            pinned: true,
            archived: false,
            runtimeThreadId: 'private-thread'
        })
        jest.spyOn(db.getRepository(GroupParticipant), 'findBy').mockResolvedValue([member])
        const participants = jest.spyOn(db.getRepository(GroupParticipant), 'find').mockResolvedValue([member])
        const groups = jest.spyOn(db.getRepository(ChatConversation), 'find').mockResolvedValue([
            Object.assign(new ChatConversation(), {
                id: 'group',
                threadId: 'public-thread',
                title: 'Team',
                updatedAt: new Date('2026-10-01'),
                lastMessageSequence: 2
            })
        ])
        const query = new SelectQueryBuilder<ChatMessage>(db)
        jest.spyOn(query, 'getMany').mockResolvedValue([
            Object.assign(new ChatMessage(), {
                conversationId: 'group',
                content: 'Latest message',
                createdAt: new Date('2026-10-09')
            })
        ])
        jest.spyOn(db.getRepository(ChatMessage), 'createQueryBuilder').mockReturnValue(query)
        jest.spyOn(query, 'where').mockReturnValue(query)
        jest.spyOn(db.getRepository(User), 'find').mockResolvedValue([
            Object.assign(new User(), { id: 'me', imageUrl: 'https://example.com/avatar.png' })
        ])
        jest.spyOn(db.getRepository(Xpert), 'find').mockResolvedValue([])
        const [result] = await service.list()
        expect(user).toHaveBeenCalledWith({ tenantId: 'tenant', organizationId: 'org' }, 'me')
        expect(groups).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({ purpose: 'group', tenantId: 'tenant', organizationId: 'org' })
            })
        )
        expect(participants).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { groupId: In(['group']), tenantId: 'tenant', organizationId: 'org', active: true }
            })
        )
        expect(query.where).toHaveBeenCalledWith({
            conversationId: In(['group']),
            tenantId: 'tenant',
            organizationId: 'org'
        })
        expect(result).toMatchObject({
            purpose: 'group',
            lastMessage: 'Latest message',
            updatedAt: '2026-10-09T00:00:00.000Z',
            memberCount: 1,
            unread: true,
            pinned: true,
            members: [{ id: 'member', avatar: { url: 'https://example.com/avatar.png' } }]
        })
        expect(JSON.stringify(result)).not.toContain('private-thread')
        expect(result.members[0]).not.toHaveProperty('subjectId')
    })
})

describe('group member candidates', () => {
    const db = new DataSource({ type: 'postgres' })
    afterEach(() => jest.restoreAllMocks())
    const create = () => {
        const access = {
            scope: () => ({ tenantId: 'tenant', organizationId: 'org', userId: 'me' }),
            user: jest.fn().mockResolvedValue(undefined),
            authorize: jest.fn().mockResolvedValue(undefined)
        }
        const assistants = { findAccessiblePublishedXperts: jest.fn() }
        const service = new GroupCatalogService(
            db,
            access as unknown as GroupAccessService,
            assistants as unknown as PublishedXpertAccessService
        )
        return { service, access, assistants }
    }
    it('returns published assistant avatars through the existing access check', async () => {
        const { service, access, assistants } = create()
        const avatar = { url: 'https://example.com/expert.png', appearance: { kind: 'image' } }
        assistants.findAccessiblePublishedXperts.mockResolvedValue([
            { id: 'assistant', title: 'Expert', avatar, apiKey: 'private' }
        ])
        expect(await service.candidates('assistant', 'Expert', 'group')).toEqual([
            { kind: 'assistant', subjectId: 'assistant', name: 'Expert', avatar }
        ])
        expect(access.authorize).toHaveBeenCalledWith('group', true)
        expect(assistants.findAccessiblePublishedXperts).toHaveBeenCalledWith({ search: 'Expert', take: 50 })
    })
    it('returns only public user profile fields within the selected organization', async () => {
        const { service } = create()
        const query = new SelectQueryBuilder<UserOrganization>(db)
        for (const method of ['innerJoinAndSelect', 'where', 'andWhere', 'take'] as const) {
            jest.spyOn(query, method).mockReturnValue(query)
        }
        jest.spyOn(query, 'getMany').mockResolvedValue([
            Object.assign(new UserOrganization(), {
                user: Object.assign(new User(), {
                    id: 'user',
                    firstName: 'A',
                    imageUrl: 'https://example.com/a.png',
                    email: 'private'
                })
            })
        ])
        jest.spyOn(db.getRepository(UserOrganization), 'createQueryBuilder').mockReturnValue(query)
        expect(await service.candidates('user')).toEqual([
            { kind: 'user', subjectId: 'user', name: 'A', avatar: { url: 'https://example.com/a.png' } }
        ])
        expect(query.where).toHaveBeenCalledWith({ tenantId: 'tenant', organizationId: 'org', isActive: true })
    })
})
