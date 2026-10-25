import { ConflictException } from '@nestjs/common'
import { access, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { ContentDocumentLocations } from './document-location.service'
import { ContentDocument, ContentLocationChange } from './entities'
import { CollaborationDocument } from '../../collaboration/entities/collaboration-document.entity'
import { documentHash } from './document-store.service'
import type { ContentLocationChangeInput } from '@xpert-ai/plugin-sdk'

describe('Durable document moves', () => {
    let root: string, document: ContentDocument, room: CollaborationDocument
    let operation: ContentLocationChange | null, lostAcknowledgement: boolean, projectionFailures: number
    let service: ContentDocumentLocations
    let records: ContentDocument[], history: ContentLocationChange[]
    const input: ContentLocationChangeInput = {
        actor: { tenantId: 'tenant', organizationId: 'org', userId: 'user' },
        projectId: 'project',
        source: { providerKey: 'source', resourceId: 'resource' },
        path: 'old.md',
        destination: 'new.md',
        title: 'New',
        parentResourceId: null,
        deleted: false,
        expectedSourceVersion: 1
    }
    beforeEach(async () => {
        root = await mkdtemp(path.join(tmpdir(), 'content-move-'))
        await writeFile(path.join(root, 'old.md'), 'accepted content')
        document = Object.assign(new ContentDocument(), {
            id: 'resource',
            tenantId: 'tenant',
            organizationId: 'org',
            projectId: 'project',
            path: 'old.md',
            fileHash: documentHash(Buffer.from('accepted content')),
            epoch: 1,
            sequence: 4,
            status: 'ready',
            sourceProvider: 'source',
            sourceId: 'resource',
            collaborationId: 'room'
        })
        records = [document]
        history = []
        room = Object.assign(new CollaborationDocument(), { id: 'room', sequenceNumber: 4, status: 'active' })
        operation = null
        lostAcknowledgement = false
        projectionFailures = 0
        const rows = {
            find: async () => records.map((row) => ({ ...row })),
            findOneByOrFail: async ({ id }: { id: string }) => ({ ...records.find((row) => row.id === id)! }),
            update: async (input: string | { id: string }, values: Partial<ContentDocument>) => {
                const id = typeof input === 'string' ? input : input.id
                const row = records.find((row) => row.id === id)!
                const next = { ...row, ...values }
                if (
                    next.status !== 'deleted' &&
                    records.some((other) => other.id !== id && other.status !== 'deleted' && other.path === next.path)
                )
                    throw new Error('active path collision')
                Object.assign(row, values)
            }
        }
        const rooms = {
            findOneOrFail: async () => ({ ...room }),
            update: async (_id: string, values: Partial<CollaborationDocument>) => Object.assign(room, values)
        }
        const changes = {
            create: (value: Partial<ContentLocationChange>) => Object.assign(new ContentLocationChange(), value),
            find: async ({ where }: { where: { status: unknown } }) =>
                where.status === 'projected'
                    ? history
                    : operation && operation.status !== 'projected'
                      ? [{ ...operation }]
                      : [],
            findOneByOrFail: async () => ({ ...operation }),
            save: async (value: ContentLocationChange) => {
                operation = { ...value }
                return value
            },
            update: async (_id: string, values: Partial<ContentLocationChange>) => Object.assign(operation!, values),
            manager: {
                transaction: async (
                    work: (manager: { getRepository: (entity: unknown) => unknown }) => Promise<unknown>
                ) =>
                    work({
                        getRepository: (entity) =>
                            entity === ContentDocument ? rows : entity === CollaborationDocument ? rooms : changes
                    })
            }
        }
        const documents = {
            access: { check: async () => undefined },
            conflict: () => {
                throw new ConflictException()
            },
            store: {
                documents: rows,
                storage: () => ({ withLock: async (_key: string, work: () => Promise<unknown>) => work() }),
                locked: async (_row: unknown, work: () => Promise<unknown>) => work()
            }
        }
        const providers = {
            get: () => ({
                locations: {
                    validateLocationChange: async () => undefined,
                    onLocationChanged: async () => {
                        if (projectionFailures-- > 0) throw new Error('source unavailable')
                    }
                }
            })
        }
        const read = async ({ path: relative }: { path: string }) => {
            const buffer = await readFile(path.join(root, relative))
            return { buffer, sha256: documentHash(buffer) }
        }
        const files = {
            read,
            readAccepted: read,
            assertMoveAvailable: async () => {
                if (
                    await access(path.join(root, input.destination)).then(
                        () => true,
                        () => false
                    )
                )
                    throw new ConflictException()
            },
            moveAccepted: async () => {
                await rename(path.join(root, input.path), path.join(root, input.destination))
                if (lostAcknowledgement) {
                    lostAcknowledgement = false
                    throw new Error('process stopped after rename')
                }
            }
        }
        service = new ContentDocumentLocations(documents as never, providers as never, files as never, changes as never)
    })
    afterEach(async () => {
        await rm(root, { recursive: true, force: true })
    })

    it('retires the old room and preserves identity, head hash and bytes at the new path', async () => {
        await service.move(input)
        expect(document.id).toBe('resource')
        expect(document.path).toBe('new.md')
        expect(document.epoch).toBe(2)
        expect(room.status).toBe('archived')
        expect(operation?.status).toBe('projected')
        expect(await readFile(path.join(root, 'new.md'), 'utf8')).toBe('accepted content')
    })
    it('replays a durable rename whose file step completed before the process stopped', async () => {
        lostAcknowledgement = true
        await expect(service.move(input)).rejects.toThrow('process stopped')
        expect(document.status).toBe('moving')
        expect(operation?.status).toBe('prepared')
        await service.repair()
        expect(document.status).toBe('ready')
        expect(document.path).toBe('new.md')
        expect(operation?.status).toBe('projected')
    })
    it('retries source metadata projection without repeating the file move', async () => {
        projectionFailures = 1
        await expect(service.move(input)).rejects.toThrow('source unavailable')
        expect(operation?.status).toBe('committed')
        await service.repair()
        expect(operation?.status).toBe('projected')
        expect(document.epoch).toBe(2)
    })
    it('refuses to retire a room while accepted edits are not yet published', async () => {
        room.sequenceNumber = 5
        await expect(service.move(input)).rejects.toBeInstanceOf(ConflictException)
        expect(document.status).toBe('ready')
        expect(room.status).toBe('active')
        expect(operation).toBeNull()
        expect(await readFile(path.join(root, 'old.md'), 'utf8')).toBe('accepted content')
    })
    it('preserves a live room when a destination name is already occupied', async () => {
        await writeFile(path.join(root, 'new.md'), 'another document')
        await expect(service.move(input)).rejects.toBeInstanceOf(ConflictException)
        expect(document.status).toBe('ready')
        expect(room.status).toBe('active')
        expect(operation).toBeNull()
        expect(await readFile(path.join(root, 'new.md'), 'utf8')).toBe('another document')
    })

    it.each(['old deleted bytes', 'accepted content'])(
        'moves the replacement without an unrelated tombstone (%s)',
        async (bytes) => {
            const tombstone = Object.assign(new ContentDocument(), document, {
                id: 'retired',
                sourceId: 'retired-source',
                status: 'deleted',
                collaborationId: null,
                fileHash: documentHash(Buffer.from(bytes))
            })
            records.unshift(tombstone)
            await service.move(input)
            expect(operation?.documents.map((entry) => entry.id)).toEqual(['resource'])
            expect(document.path).toBe('new.md')
            expect(tombstone).toMatchObject({ path: 'old.md', status: 'deleted', epoch: 1 })
        }
    )

    it('restores the explicitly requested deleted source document', async () => {
        document.status = 'deleted'
        document.collaborationId = null
        await service.move(input)
        expect(document).toMatchObject({ path: 'new.md', status: 'ready' })
    })

    it('restores only the deleted descendants recorded by the source folder operation', async () => {
        await rm(path.join(root, 'old.md'))
        await mkdir(path.join(root, 'old.md'))
        await writeFile(path.join(root, 'old.md', 'child.md'), 'accepted content')
        Object.assign(document, {
            path: 'old.md/child.md',
            sourceId: 'child',
            status: 'deleted',
            collaborationId: null
        })
        const retired = Object.assign(new ContentDocument(), document, { id: 'retired', sourceId: 'retired' })
        records.unshift(retired)
        history.push(
            Object.assign(new ContentLocationChange(), {
                input: { ...input, path: 'original', destination: 'old.md', deleted: true },
                status: 'projected',
                documents: [
                    {
                        id: document.id,
                        from: 'original/child.md',
                        to: document.path,
                        hash: document.fileHash,
                        epoch: document.epoch
                    }
                ]
            })
        )
        await service.move(input)
        expect(document).toMatchObject({ path: 'new.md/child.md', status: 'ready' })
        expect(retired).toMatchObject({ path: 'old.md/child.md', status: 'deleted' })
        expect(operation?.documents.map((entry) => entry.id)).toEqual(['resource'])
    })
})
