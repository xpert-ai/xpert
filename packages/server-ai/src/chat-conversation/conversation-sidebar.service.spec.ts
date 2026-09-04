import { ForbiddenException, BadRequestException } from '@nestjs/common'
import { RequestContext } from '@xpert-ai/server-core'
import { Repository } from 'typeorm'
import { AssistantUserPreference } from '../xpert/assistant-user-preference.entity'
import { ChatConversationService } from './conversation.service'
import { ChatConversationSidebarService } from './conversation-sidebar.service'

function queryBuilder() {
    const query = {
        select: jest.fn(),
        where: jest.fn(),
        andWhere: jest.fn(),
        orderBy: jest.fn(),
        addOrderBy: jest.fn(),
        setParameter: jest.fn(),
        setParameters: jest.fn(),
        take: jest.fn(),
        skip: jest.fn(),
        insert: jest.fn(),
        values: jest.fn(),
        orIgnore: jest.fn(),
        update: jest.fn(),
        set: jest.fn(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0])
    }
    for (const method of [
        'select',
        'where',
        'andWhere',
        'orderBy',
        'addOrderBy',
        'setParameter',
        'setParameters',
        'take',
        'skip',
        'insert',
        'values',
        'orIgnore',
        'update',
        'set'
    ] as const) {
        query[method].mockReturnValue(query)
    }
    return query
}

describe('ChatConversationSidebarService', () => {
    const conversation = {
        id: 'conversation-1',
        xpertId: 'assistant-1',
        createdById: 'user-1',
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        threadId: 'thread-1'
    }
    let listQuery: ReturnType<typeof queryBuilder>
    let preferenceQuery: ReturnType<typeof queryBuilder>
    let findPreference: jest.Mock
    let assertAccess: jest.Mock
    let service: ChatConversationSidebarService

    beforeEach(() => {
        jest.spyOn(RequestContext, 'currentTenantId').mockReturnValue('tenant-1')
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue('user-1')
        jest.spyOn(RequestContext, 'getOrganizationId').mockReturnValue('org-1')
        listQuery = queryBuilder()
        preferenceQuery = queryBuilder()
        findPreference = jest.fn().mockResolvedValue(null)
        assertAccess = jest.fn().mockResolvedValue(conversation)
        const preferences = Object.assign(Object.create(Repository.prototype), {
            findOne: findPreference,
            createQueryBuilder: jest.fn(() => preferenceQuery)
        }) as Repository<AssistantUserPreference>
        const conversations = Object.assign(Object.create(ChatConversationService.prototype), {
            assertAccess,
            repository: { createQueryBuilder: jest.fn(() => listQuery) }
        }) as ChatConversationService
        service = new ChatConversationSidebarService(conversations, preferences)
    })

    afterEach(() => jest.restoreAllMocks())

    it('scopes listings to the current tenant, organization, owner and Assistant', async () => {
        await service.list('assistant-1', 10, 20)
        expect(listQuery.where).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            createdById: 'user-1',
            xpertId: 'assistant-1'
        })
        expect(findPreference).toHaveBeenCalledWith({
            where: { tenantId: 'tenant-1', organizationId: 'org-1', userId: 'user-1', assistantId: 'assistant-1' }
        })
        expect(listQuery.skip).toHaveBeenCalledWith(20)
    })

    it('orders pins before pagination and keeps archived conversations out of recent lists', async () => {
        findPreference.mockResolvedValue({
            preferences: {
                conversationSidebar: {
                    old: { pinned: true, archived: false },
                    hidden: { pinned: false, archived: true }
                }
            }
        })
        listQuery.getManyAndCount.mockResolvedValue([[{ ...conversation, id: 'old' }], 1])
        const result = await service.list('assistant-1')
        expect(listQuery.orderBy).toHaveBeenCalledWith(expect.stringContaining('CASE WHEN'), 'ASC')
        expect(listQuery.setParameter).toHaveBeenCalledWith('pinnedIds', ['old'])
        expect(listQuery.andWhere).toHaveBeenCalledWith('conversation.id NOT IN (:...archivedIds)', {
            archivedIds: ['hidden']
        })
        expect(result.items[0].sidebar).toEqual({ pinned: true, archived: false })
    })

    it('returns only archived conversations for the recovery list', async () => {
        findPreference.mockResolvedValue({ preferences: { conversationSidebar: { hidden: { archived: true } } } })
        await service.list('assistant-1', 30, 0, true)
        expect(listQuery.andWhere).toHaveBeenCalledWith('conversation.id IN (:...archivedIds)', {
            archivedIds: ['hidden']
        })
    })

    it('returns an empty archive without fetching all conversations', async () => {
        expect(await service.list('assistant-1', 30, 0, true)).toEqual({ items: [], total: 0 })
        expect(listQuery.getManyAndCount).not.toHaveBeenCalled()
    })

    it('merges one preference without modifying conversation runtime options or other domains', async () => {
        findPreference.mockResolvedValue({
            preferences: { conversationSidebar: { 'conversation-1': { pinned: true, archived: false } } }
        })
        expect(await service.update('conversation-1', { pinned: true })).toEqual({ pinned: true, archived: false })
        expect(assertAccess).toHaveBeenCalledWith('conversation-1')
        expect(preferenceQuery.orIgnore).toHaveBeenCalled()
        expect(preferenceQuery.where).toHaveBeenCalledWith({
            tenantId: 'tenant-1',
            organizationId: 'org-1',
            userId: 'user-1',
            assistantId: 'assistant-1'
        })
        expect(preferenceQuery.setParameters).toHaveBeenCalledWith({
            conversationId: 'conversation-1',
            sidebarPatch: '{"pinned":true}'
        })
        expect(preferenceQuery.set.mock.calls[0][0].preferences()).toContain(
            "COALESCE(\"preferences\" -> 'conversationSidebar', '{}'::jsonb)"
        )
    })

    it('rejects preferences for another user or organization before writing', async () => {
        assertAccess.mockResolvedValueOnce({ ...conversation, createdById: 'someone-else' })
        await expect(service.update('conversation-1', { pinned: true })).rejects.toBeInstanceOf(ForbiddenException)
        assertAccess.mockResolvedValueOnce({ ...conversation, organizationId: 'other-org' })
        await expect(service.update('conversation-1', { archived: true })).rejects.toBeInstanceOf(ForbiddenException)
        expect(preferenceQuery.execute).not.toHaveBeenCalled()
    })

    it('requires an authenticated context', async () => {
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(undefined)
        await expect(service.list('assistant-1')).rejects.toBeInstanceOf(ForbiddenException)
        expect(findPreference).not.toHaveBeenCalled()
    })

    it('rejects empty updates', async () => {
        await expect(service.update('conversation-1', {})).rejects.toBeInstanceOf(BadRequestException)
        expect(assertAccess).not.toHaveBeenCalled()
    })
})
