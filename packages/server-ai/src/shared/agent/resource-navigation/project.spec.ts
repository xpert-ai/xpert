jest.mock('@langchain/core/callbacks/dispatch', () => ({ dispatchCustomEvent: jest.fn() }))
import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { createProjectResourceNavigationTools } from './project'

function fixture() {
    const list = jest.fn().mockResolvedValue({
        items: [{ resource: { kind: 'project-content', id: 'content-id' }, title: 'Inventory' }],
        nextCursor: null
    })
    const resolve = jest.fn().mockResolvedValue({
        viewKey: 'test__document',
        selectionId: 'artifact-id',
        parameters: { contentId: 'content-id', contentTitle: 'Inventory' }
    })
    const context: Parameters<typeof createProjectResourceNavigationTools>[0] = {
        tenantId: 'tenant',
        organizationId: 'org',
        userId: 'viewer',
        projectId: 'project',
        conversationId: 'conversation',
        xpertId: 'assistant'
    }
    return { list, resolve, context }
}
beforeEach(() => jest.mocked(dispatchCustomEvent).mockClear())
it('resolves a canonical document tab using the current actor, with a card fallback and live request identity', async () => {
    const f = fixture(),
        entry = createProjectResourceNavigationTools(f.context, { list: f.list }, { resolve: f.resolve })
    await entry[1].invoke({ query: 'Inventory' })
    expect(f.list).toHaveBeenCalledWith(
        expect.objectContaining({
            actor: { tenantId: 'tenant', organizationId: 'org', userId: 'viewer' },
            assistantId: 'assistant',
            projectId: 'project'
        }),
        expect.objectContaining({ search: 'Inventory' })
    )
    expect(f.resolve).toHaveBeenCalledWith(
        expect.objectContaining({ source: { providerKey: 'platform.content.catalog', resourceId: 'content-id' } })
    )
    const events = jest.mocked(dispatchCustomEvent).mock.calls.map((call) => call[1])
    expect(events).toHaveLength(2)
    expect(events[1]).toMatchObject({
        type: 'workbench.view.open',
        viewKey: 'test__document',
        projectId: 'project',
        conversationId: 'conversation',
        parameters: { contentId: 'content-id' },
        requestId: expect.any(String),
        issuedAt: expect.any(Number)
    })
})
it('emits nothing after authorization denial', async () => {
    const f = fixture(),
        entry = createProjectResourceNavigationTools(f.context, { list: f.list }, { resolve: f.resolve })
    f.resolve.mockRejectedValue(new Error('revoked'))
    await expect(entry[1].invoke({ query: 'Inventory' })).rejects.toThrow('revoked')
    expect(dispatchCustomEvent).not.toHaveBeenCalled()
})

it('does not expose navigation without a project scope', () => {
    const f = fixture()
    expect(
        createProjectResourceNavigationTools(
            { ...f.context, projectId: undefined },
            { list: f.list },
            { resolve: f.resolve }
        )
    ).toEqual([])
    expect(f.list).not.toHaveBeenCalled()
})
