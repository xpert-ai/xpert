import { ConflictException } from '@nestjs/common'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { ContentDocumentStore, documentHash } from './document-store.service'
import { ContentDocument, ContentRevision } from './entities'
import { VolumeHandle } from '../../shared/volume'
import { CollaborationDocument } from '../../collaboration/entities/collaboration-document.entity'

describe('Content document publication', () => {
    let root: string, row: ContentDocument, store: ContentDocumentStore
    let revisions: ContentRevision[], failPublishTransaction: boolean
    let room: CollaborationDocument
    const scope = { actor: { tenantId: 'tenant', organizationId: 'org', userId: 'editor' }, projectId: 'project' }
    beforeEach(async () => {
        root = await mkdtemp(path.join(tmpdir(), 'content-publication-'))
        await writeFile(path.join(root, 'note.md'), 'original')
        row = Object.assign(new ContentDocument(), {
            id: 'resource',
            tenantId: 'tenant',
            organizationId: 'org',
            projectId: 'project',
            path: 'note.md',
            title: 'Note',
            modelKey: 'test',
            schemaVersion: 1,
            epoch: 1,
            fileHash: documentHash(Buffer.from('original')),
            headRevisionId: null,
            collaborationId: null,
            createdById: 'editor',
            sequence: 0,
            status: 'ready'
        })
        revisions = []
        failPublishTransaction = false
        room = Object.assign(new CollaborationDocument(), {
            id: 'room',
            providerKey: 'platform.content.document',
            resourceId: 'resource:1',
            sequenceNumber: 0,
            status: 'active'
        })
        const rooms = {
            findOneOrFail: async () => ({ ...room }),
            update: async (_id: string, patch: Partial<CollaborationDocument>) => Object.assign(room, patch)
        }
        const revisionRepository = {
            findOneBy: async (where: Partial<ContentRevision>) =>
                revisions.find((revision) =>
                    Object.entries(where).every(([key, value]) => Reflect.get(revision, key) === value)
                ),
            create: (input: Partial<ContentRevision>) => Object.assign(new ContentRevision(), input),
            save: async (revision: ContentRevision) => {
                revisions.push({ ...revision })
                return revision
            },
            update: async (id: string, patch: Partial<ContentRevision>) =>
                Object.assign(revisions.find((revision) => revision.id === id)!, patch)
        }
        let calls = 0
        const documents = {
            findOneByOrFail: async () => ({ ...row }),
            update: async (_id: string, patch: Partial<ContentDocument>) => Object.assign(row, patch),
            manager: {
                transaction: async (
                    work: (manager: { getRepository: (entity: unknown) => unknown }) => Promise<unknown>
                ) => {
                    if (++calls % 2 === 0 && failPublishTransaction) {
                        failPublishTransaction = false
                        throw new Error('database unavailable after file rename')
                    }
                    return work({
                        getRepository: (entity) =>
                            entity === ContentDocument
                                ? documents
                                : entity === CollaborationDocument
                                  ? rooms
                                  : revisionRepository
                    })
                }
            }
        }
        const volume = new VolumeHandle(
            { tenantId: 'tenant', projectId: 'project', catalog: 'projects' },
            root,
            root,
            ''
        )
        store = new ContentDocumentStore(
            { resolve: () => volume },
            documents as never,
            revisionRepository as never,
            {
                check: async () => ({ canWrite: true }),
                denied: () => {
                    throw new Error('denied')
                }
            } as never
        )
    })
    afterEach(async () => {
        await rm(root, { recursive: true, force: true })
    })
    const input = (mutationId = 'one', markdown = 'edited', sequence = 1) => ({
        mutationId,
        markdown,
        sequence,
        stateBase64: Buffer.from(`state:${markdown}`).toString('base64'),
        label: 'Edit',
        scope
    })
    const publish = (value = input()) => store.locked(row, () => store.publish({ ...row }, value))

    it('publishes immutable file/state, advances one head and deduplicates exact retries', async () => {
        const revision = await publish()
        expect(await readFile(path.join(root, 'note.md'), 'utf8')).toBe('edited')
        expect((await store.bytes(row, revision)).toString()).toBe('edited')
        expect(await store.state(row, revision)).toBe(input().stateBase64)
        expect(row.headRevisionId).toBe(revision.id)
        expect(row.projectionPending).toBe(true)
        await publish()
        expect(revisions).toHaveLength(1)
        await expect(publish({ ...input(), stateBase64: 'b3RoZXI=' })).rejects.toBeInstanceOf(ConflictException)
    })
    it('recovers a durable candidate after file publication succeeds but the head transaction fails', async () => {
        failPublishTransaction = true
        await expect(publish()).rejects.toThrow('database unavailable')
        expect(await readFile(path.join(root, 'note.md'), 'utf8')).toBe('edited')
        expect(row.headRevisionId).toBeNull()
        expect(revisions[0].status).toBe('prepared')
        await store.locked(row, () => store.finish({ ...row }, revisions[0]))
        expect(row.headRevisionId).toBe(revisions[0].id)
        expect(row.status).toBe('ready')
    })
    it('preserves external file changes and keeps the candidate for explicit conflict resolution', async () => {
        await writeFile(path.join(root, 'note.md'), 'external')
        await expect(publish()).rejects.toBeInstanceOf(ConflictException)
        expect(await readFile(path.join(root, 'note.md'), 'utf8')).toBe('external')
        expect(row.status).toBe('conflict')
        expect((await store.bytes(row, revisions[0])).toString()).toBe('edited')
    })
    it('fences out-of-order publications and retired epochs', async () => {
        await publish(input('newer', 'newer', 4))
        await expect(publish(input('older', 'older', 2))).rejects.toBeInstanceOf(ConflictException)
        const old = revisions[0]
        row.epoch = 2
        row.headRevisionId = null
        await expect(store.locked(row, () => store.finish({ ...row }, old))).rejects.toBeInstanceOf(ConflictException)
        expect(await readFile(path.join(root, 'note.md'), 'utf8')).toBe('newer')
    })
    it('records room retirement with the new epoch intent, then recovers after publication acknowledgement fails', async () => {
        failPublishTransaction = true
        const next = { ...row, epoch: 2, schemaVersion: 2, collaborationId: null }
        await expect(
            store.locked(row, () =>
                store.publish(next, { ...input(), retire: { documentId: 'room', expectedSequence: 0 } })
            )
        ).rejects.toThrow('database unavailable')
        expect(room.status).toBe('archived')
        expect(row.epoch).toBe(2)
        expect(row.schemaVersion).toBe(2)
        expect(row.status).toBe('pending')
        expect(revisions[0].status).toBe('prepared')
        await store.locked(row, () => store.finish({ ...row }, revisions[0]))
        expect(row.headRevisionId).toBe(revisions[0].id)
    })
    it('cannot retire a room whose accepted sequence advanced during restore preparation', async () => {
        room.sequenceNumber = 3
        await expect(
            store.locked(row, () =>
                store.publish(
                    { ...row, epoch: 2 },
                    {
                        ...input(),
                        retire: { documentId: 'room', expectedSequence: 0 }
                    }
                )
            )
        ).rejects.toBeInstanceOf(ConflictException)
        expect(room.status).toBe('active')
        expect(row.epoch).toBe(1)
        expect(revisions).toHaveLength(0)
        expect(await readFile(path.join(root, 'note.md'), 'utf8')).toBe('original')
    })
})
