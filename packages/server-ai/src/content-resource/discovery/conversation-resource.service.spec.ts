import { Test } from '@nestjs/testing'
import { CommandBus } from '@nestjs/cqrs'
import { ConversationResourceService } from './conversation-resource.service'
import { ContentCatalogService } from '../catalog/content-catalog.service'
import { ResolveConversationResourceScopeCommand } from '../../chat-group/commands/conversation-resource-scope.command'

async function fixture() {
    const scope = {
        actor: { tenantId: 'tenant', organizationId: 'org', userId: 'user' },
        projectId: 'project',
        assistantId: 'assistant',
        conversationId: 'runtime'
    }
    const audience = jest.fn().mockResolvedValue({ groupId: 'group' })
    const shared = jest.fn().mockResolvedValue({
        items: [{ resource: { kind: 'group-reference', id: 'ref' }, title: 'Shared', access: { canEdit: false } }],
        nextOffset: null
    })
    const list = jest.fn().mockResolvedValue({
        items: [
            {
                contentId: 'owned',
                title: 'Owned',
                typeId: 'dashboard',
                resourceRef: { providerKey: 'provider', resourceId: 'source' },
                canWrite: true
            }
        ],
        hasMore: false
    })
    const module = await Test.createTestingModule({
        providers: [
            ConversationResourceService,
            { provide: ContentCatalogService, useValue: { list } },
            {
                provide: CommandBus,
                useValue: {
                    execute: (command: object) =>
                        command instanceof ResolveConversationResourceScopeCommand ? audience(command) : shared(command)
                }
            }
        ]
    }).compile()
    return { service: module.get(ConversationResourceService), scope, audience, shared, list }
}

it('combines owned content and accepted references without registering or changing ownership', async () => {
    const f = await fixture()
    const page = await f.service.list(f.scope, { typeId: 'dashboard' })
    expect(page).toMatchObject({
        sharedAvailable: true,
        nextCursor: null,
        items: [
            { resource: { kind: 'project-content', id: 'owned' }, projectId: 'project', access: { canEdit: true } },
            { resource: { kind: 'group-reference', id: 'ref' }, access: { canEdit: false } }
        ]
    })
    expect(f.shared).toHaveBeenCalledWith(
        expect.objectContaining({ groupId: 'group', query: expect.objectContaining({ typeId: 'dashboard' }) })
    )
})

it('keeps continuation through unavailable owned entries, then enters shared references', async () => {
    const f = await fixture()
    f.list.mockResolvedValueOnce({ items: [{ availability: 'provider-unavailable' }], hasMore: true })
    const first = await f.service.list(f.scope, { limit: 1 })
    expect(first.items).toEqual([])
    expect(first.nextCursor).toBeTruthy()
    expect(f.shared).not.toHaveBeenCalled()
    const second = await f.service.list(f.scope, { limit: 1, cursor: first.nextCursor })
    expect(second.items[0].resource.kind).toBe('project-content')
    expect(f.list).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 1 }))
    const third = await f.service.list(f.scope, { limit: 1, cursor: second.nextCursor })
    expect(third.items[0].resource.kind).toBe('group-reference')
    expect(third.nextCursor).toBeNull()
})

it('rejects cursors across filters, actors and groups even if they reuse a Project', async () => {
    const f = await fixture()
    const first = await f.service.list(f.scope, { limit: 1 })
    await expect(f.service.list(f.scope, { limit: 1, cursor: first.nextCursor, search: 'changed' })).rejects.toThrow()
    await expect(
        f.service.list(
            { ...f.scope, actor: { ...f.scope.actor, userId: 'other' } },
            { limit: 1, cursor: first.nextCursor }
        )
    ).rejects.toThrow()
    f.audience.mockResolvedValue({ groupId: 'other-group' })
    await expect(f.service.list(f.scope, { limit: 1, cursor: first.nextCursor })).rejects.toThrow()
    expect(f.shared).not.toHaveBeenCalled()
})

it('does not fall back to Project content after denial or claim personal scope has group references', async () => {
    const f = await fixture()
    f.audience.mockResolvedValueOnce({ groupId: null })
    expect(await f.service.list(f.scope, { origin: 'shared' })).toEqual({
        items: [],
        nextCursor: null,
        sharedAvailable: false
    })
    f.audience.mockRejectedValue(new Error('removed'))
    await expect(f.service.list(f.scope, {})).rejects.toThrow('removed')
    expect(f.list).not.toHaveBeenCalled()
    expect(f.shared).not.toHaveBeenCalled()
})
