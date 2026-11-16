import { ConflictException } from '@nestjs/common'
import type { ContentResourceSnapshot } from '@xpert-ai/contracts'
import { ContentFileOwnershipService } from './content-file-ownership.service'

const snapshot: ContentResourceSnapshot = {
    projectId: 'bc260c6d-7000-4000-8000-000000000000',
    title: 'Owned resource',
    typeId: 'spreadsheet',
    modelId: 'xpert.spreadsheet',
    schemaVersion: '1',
    editProtocol: { id: 'operations', version: '1' },
    revision: '1',
    updatedAt: '2026-11-12T00:00:00.000Z',
    deleted: false,
    source: { kind: 'bundle', rootPath: 'owned/book', entryPath: 'revisions/1.json' },
    containedPaths: [{ path: 'owned/book', recursive: true }],
    defaultEditorKey: 'editor',
    allowedActions: [],
    writeOwnership: 'provider'
}
function fixture(value: ContentResourceSnapshot = snapshot) {
    const documents = { find: jest.fn(async () => []) }
    const entries = { find: jest.fn(async () => [{ offlineSnapshot: value }]) }
    return { service: new ContentFileOwnershipService(documents as never, entries as never), documents, entries }
}
it('denies exact paths, nested overwrite/upload, and recursive ancestor deletes with path boundaries', async () => {
    const { service, entries } = fixture()
    for (const [path, recursive] of [
        ['owned/book', false],
        ['owned/book/revisions/1.json', false],
        ['owned', true]
    ] as const)
        await expect(service.assertUnmanaged('tenant', snapshot.projectId, path, recursive)).rejects.toThrow(
            ConflictException
        )
    await expect(
        service.assertUnmanaged('tenant', snapshot.projectId, 'owned/book-copy/1.json')
    ).resolves.toBeUndefined()
    await expect(service.assertUnmanaged('tenant', snapshot.projectId, 'owned', false)).resolves.toBeUndefined()
    expect(entries.find).toHaveBeenCalledWith({
        where: { tenantId: 'tenant', projectId: snapshot.projectId },
        select: { offlineSnapshot: true }
    })
})
it('preserves explicit ownership after trash while leaving ordinary indexed files editable', async () => {
    await expect(
        fixture({ ...snapshot, deleted: true }).service.assertUnmanaged(
            'tenant',
            snapshot.projectId,
            'owned/book/1.json'
        )
    ).rejects.toThrow(ConflictException)
    await expect(
        fixture({ ...snapshot, writeOwnership: undefined }).service.assertUnmanaged(
            'tenant',
            snapshot.projectId,
            'owned/book/1.json'
        )
    ).resolves.toBeUndefined()
})
it('keeps authorized provider projection writes separate from generic Workspace writes', async () => {
    const { service, entries } = fixture()
    await expect(
        service.assertUnmanagedDocument('tenant', snapshot.projectId, 'owned/book/1.json')
    ).resolves.toBeUndefined()
    expect(entries.find).not.toHaveBeenCalled()
})
it('fails closed on malformed persisted ownership metadata', async () => {
    const { service, entries } = fixture()
    entries.find.mockResolvedValueOnce([
        { offlineSnapshot: { ...snapshot, containedPaths: [{ path: '../escape', recursive: true }] } }
    ])
    await expect(service.assertUnmanaged('tenant', snapshot.projectId, 'owned/book/1.json')).rejects.toThrow(
        ConflictException
    )
})
it.each(['owned/./book/1.json', 'owned//book/1.json', 'owned/book/', 'owned/book/../book/1.json'])(
    'blocks equivalent filesystem path %s',
    async (path) => {
        await expect(fixture().service.assertUnmanaged('tenant', snapshot.projectId, path, true)).rejects.toThrow(
            ConflictException
        )
    }
)
it('rejects ownership metadata for a different Project', async () => {
    const { service } = fixture({ ...snapshot, projectId: 'bc260c6d-7000-4000-8000-000000000001' })
    await expect(service.assertUnmanaged('tenant', snapshot.projectId, 'unrelated.txt')).rejects.toThrow(
        ConflictException
    )
})
it.each(['owned/../book', '/owned/book', 'owned//book', 'owned\\book'])(
    'fails closed on malformed owned source path %s',
    async (rootPath) => {
        const { service } = fixture({
            ...snapshot,
            containedPaths: [],
            source: { kind: 'bundle', rootPath, entryPath: 'book.json' }
        })
        await expect(service.assertUnmanaged('tenant', snapshot.projectId, 'owned/book/book.json')).rejects.toThrow(
            ConflictException
        )
    }
)
