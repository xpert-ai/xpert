import { ContentEditorPreferences, contentModelKey } from './editor-preferences.service'
import type { ContentCatalogItem, ResourceContentEditorRegistration } from '@xpert-ai/contracts'
import type { ContentEditorPreference } from './editor-preference.entity'
const scope = { actor: { tenantId: 't', organizationId: 'o', userId: 'u' }, projectId: 'p', contentId: 'c' }
const item: ContentCatalogItem = {
    contentId: 'c',
    projectId: 'p',
    resourceRef: { providerKey: 'native', resourceId: 'native-id' },
    bindingRevision: 1,
    typeId: 'presentation',
    modelId: 'deck',
    schemaVersion: '2',
    editProtocol: { id: 'yjs', version: '2' },
    title: 'Deck',
    revision: '1',
    updatedAt: '2026-10-25T00:00:00.000Z',
    deleted: false,
    source: { kind: 'managed' },
    canWrite: true,
    defaultEditorKey: 'a',
    allowedActions: []
}
const editor: ResourceContentEditorRegistration = {
    kind: 'resource',
    key: 'b',
    protocolVersion: 2,
    title: 'B',
    view: { providerKey: 'b', viewKey: 'v', entry: 'e' },
    supports: [{ ...item, access: ['view', 'edit'] }]
}
function fixture() {
    const saved: Partial<ContentEditorPreference>[] = []
    const query = {
        insert: jest.fn().mockReturnThis(),
        values: jest.fn().mockReturnThis(),
        orIgnore: jest.fn().mockReturnThis(),
        execute: jest.fn()
    }
    const rows = {
        findBy: jest.fn(async () => saved),
        createQueryBuilder: () => query,
        update: jest.fn(async () => ({ affected: 1 }))
    }
    const membership = {
        innerJoin: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getExists: jest.fn(async () => false)
    }
    const catalog = { get: jest.fn(async () => item) },
        projects = { listReadable: jest.fn(async () => [{ canManage: false }]) }
    const service = new ContentEditorPreferences(
        rows as never,
        { createQueryBuilder: () => membership } as never,
        catalog as never,
        { listRegistrations: () => [{ strategy: { descriptor: editor } }] } as never,
        projects as never
    )
    return { service, saved, rows, membership, projects }
}
it('orders resource, project and organization preferences independent of database order', async () => {
    const f = fixture()
    f.saved.push(
        { scope: 'organization', scopeId: 'o', editorKey: 'org' },
        { scope: 'resource', scopeId: 'c', editorKey: 'resource' },
        { scope: 'project', scopeId: 'p', editorKey: 'project' }
    )
    expect(await f.service.keys(scope, item)).toEqual(['resource', 'project', 'org'])
    expect(contentModelKey({ ...item, schemaVersion: '3' })).not.toBe(contentModelKey(item))
})
it('separates editor, project manager and organization administrator permissions', async () => {
    const f = fixture()
    expect((await f.service.get(scope)).map((value) => value.canSet)).toEqual([true, false, false])
    await expect(f.service.set({ ...scope, scope: 'project', editorKey: 'b', expectedRevision: 0 })).rejects.toThrow()
    expect(f.rows.update).not.toHaveBeenCalled()
    f.projects.listReadable.mockResolvedValue([{ canManage: true }])
    f.membership.getExists.mockResolvedValue(true)
    expect((await f.service.get(scope)).every((value) => value.canSet)).toBe(true)
})
it('rejects unavailable/incompatible editors and stale preference updates', async () => {
    const f = fixture()
    await expect(
        f.service.set({ ...scope, scope: 'resource', editorKey: 'missing', expectedRevision: 0 })
    ).rejects.toThrow()
    expect(f.rows.update).not.toHaveBeenCalled()
    f.rows.update.mockResolvedValue({ affected: 0 })
    await expect(f.service.set({ ...scope, scope: 'resource', editorKey: 'b', expectedRevision: 0 })).rejects.toThrow()
    expect(f.rows.update).toHaveBeenCalledWith(
        expect.objectContaining({ revision: 0, scope: 'resource', scopeId: 'c' }),
        { editorKey: 'b', revision: 1 }
    )
})
