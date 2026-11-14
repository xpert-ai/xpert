import {
    RequestContext,
    type ICollaborationOperationsProvider,
    type ICollaborationDocumentProvider
} from '@xpert-ai/plugin-sdk'
import * as Y from 'yjs'
import { CollaborationDocument, CollaborationUpdate } from './entities'
import { CollaborationService } from './collaboration.service'
import { runWithCapturedRequestContext } from '../shared/request-context'

function matches(value: Record<string, unknown>, where: Record<string, unknown>) {
    return Object.entries(where).every(([key, expected]) => value[key] === expected)
}

function createHarness(redis?: TestRedis, operationProvider?: ICollaborationOperationsProvider) {
    const documents: CollaborationDocument[] = []
    const updates: CollaborationUpdate[] = []
    let id = 0

    const documentRepository = {
        manager: {
            transaction: async (work: (manager: { getRepository: (entity: unknown) => unknown }) => unknown) =>
                work({
                    getRepository: (entity) =>
                        entity === CollaborationDocument ? documentRepository : updateRepository
                })
        },
        create: (value: Partial<CollaborationDocument>) => Object.assign(new CollaborationDocument(), value),
        save: async (value: CollaborationDocument) => {
            if (!value.id) {
                value.id = `document-${++id}`
                value.createdAt = new Date()
            }
            value.updatedAt = new Date()
            const index = documents.findIndex(({ id: documentId }) => documentId === value.id)
            if (index < 0) documents.push(value)
            else documents[index] = value
            return value
        },
        findOne: async ({ where }: { where: Record<string, unknown> }) =>
            documents.find((item) => matches(item as unknown as Record<string, unknown>, where)) ?? null,
        findOneOrFail: async ({ where }: { where: Partial<CollaborationDocument> }) => {
            const value = documents.find((item) =>
                Object.entries(where).every(([key, value]) => Reflect.get(item, key) === value)
            )
            if (!value) throw new Error('missing document')
            return value
        },
        findOneBy: async (where: Record<string, unknown>) =>
            documents.find((item) => matches(item as unknown as Record<string, unknown>, where)) ?? null,
        findOneByOrFail: async (where: Record<string, unknown>) => {
            const value = documents.find((item) => matches(item as unknown as Record<string, unknown>, where))
            if (!value) throw new Error('missing document')
            return value
        },
        update: async (where: string | Partial<CollaborationDocument>, patch: Partial<CollaborationDocument>) => {
            const value = documents.find((item) =>
                typeof where === 'string'
                    ? item.id === where
                    : Object.entries(where).every(([key, value]) => Reflect.get(item, key) === value)
            )
            if (value) Object.assign(value, patch)
        }
    }
    const updateRepository = {
        create: (value: Partial<CollaborationUpdate>) => Object.assign(new CollaborationUpdate(), value),
        save: async (value: CollaborationUpdate) => {
            // Mirror both unique indexes so migration tests catch real journal conflicts.
            if (
                updates.some(
                    (entry) =>
                        entry.documentId === value.documentId &&
                        (entry.updateHash === value.updateHash || entry.sequenceNumber === value.sequenceNumber)
                )
            )
                throw new Error('Duplicate collaboration update journal entry')
            if (!value.id) {
                value.id = `update-${++id}`
                value.createdAt = new Date()
            }
            value.updatedAt = new Date()
            updates.push(value)
            return value
        },
        findOne: async ({ where }: { where: Record<string, unknown> }) =>
            updates.find((item) => matches(item as unknown as Record<string, unknown>, where)) ?? null,
        createQueryBuilder: () => ({
            delete() {
                return this
            },
            where() {
                return this
            },
            andWhere() {
                return this
            },
            execute: async () => ({ affected: 0 })
        })
    }
    const provider: ICollaborationDocumentProvider = {
        authorize: jest.fn(() => true),
        initializeDocument: jest.fn(() => {
            const document = new Y.Doc()
            return {
                stateBase64: Buffer.from(Y.encodeStateAsUpdate(document)).toString('base64'),
                schemaVersion: 2,
                initialSequence: 4
            }
        }),
        materializeDocument: jest.fn()
    }
    const providers = { get: jest.fn(() => operationProvider ?? provider) }
    const queue = { enqueue: jest.fn() }
    const service = new CollaborationService(
        documentRepository as never,
        updateRepository as never,
        providers as never,
        redis as never,
        queue as never
    )
    const api = service.createScopedApi({ tenantId: 'tenant', organizationId: 'organization', userId: 'user' })
    return { api, service, documents, updates, provider, providers, queue }
}

class TestRedis {
    readonly strings = new Map<string, string>()
    readonly sets = new Map<string, Set<string>>()
    readonly published: Array<{ channel: string; message: string }> = []

    async set(key: string, value: string) {
        this.strings.set(key, value)
        return 'OK'
    }
    async get(key: string) {
        return this.strings.get(key) ?? null
    }
    async del(key: string) {
        return this.strings.delete(key) ? 1 : 0
    }
    async sAdd(key: string, value: string) {
        const values = this.sets.get(key) ?? new Set<string>()
        values.add(value)
        this.sets.set(key, values)
        return 1
    }
    async sRem(key: string, value: string) {
        return this.sets.get(key)?.delete(value) ? 1 : 0
    }
    async sMembers(key: string) {
        return Array.from(this.sets.get(key) ?? [])
    }
    async expire() {
        return true
    }
    async publish(channel: string, message: string) {
        this.published.push({ channel, message })
        return 1
    }
}

describe('CollaborationService', () => {
    it('keeps accepted edits durable, rejects failed worker attempts and repairs the latest state', async () => {
        const { api, service, documents, provider, queue } = createHarness()
        const created = await api.ensureDocument({ providerKey: 'example.document', resourceId: 'resource' })
        jest.mocked(provider.materializeDocument).mockRejectedValue(new Error('source disk unavailable'))
        const local = new Y.Doc()
        local.getText('body').insert(0, 'Accepted while the projection is unavailable')
        const accepted = await api.applyUpdate({
            documentId: created.id,
            updateBase64: Buffer.from(Y.encodeStateAsUpdate(local)).toString('base64')
        })
        expect(accepted.sequenceNumber).toBe(5)
        expect(accepted.materializationStatus).toBe('failed')
        expect(documents[0].materializedSequence).toBe(4)
        expect(queue.enqueue).toHaveBeenCalledTimes(1)
        await expect(service.retryMaterialization(created.id)).rejects.toThrow('source disk unavailable')
        expect(queue.enqueue).toHaveBeenCalledTimes(1)
        jest.mocked(provider.materializeDocument).mockResolvedValue(undefined)
        await service.retryMaterialization(created.id)
        expect(documents[0]).toMatchObject({
            materializationStatus: 'ready',
            materializedSequence: 5,
            sequenceNumber: 5,
            lastMaterializationError: null
        })
        const event = jest.mocked(provider.materializeDocument).mock.calls.at(-1)![0]
        const recovered = new Y.Doc()
        Y.applyUpdate(recovered, Buffer.from(event.stateBase64, 'base64'))
        expect(recovered.getText('body').toString()).toBe(local.getText('body').toString())
        expect(event).toMatchObject({ userId: 'user', sequenceNumber: 5, origin: 'platform:materialization-retry' })
        const calls = jest.mocked(provider.materializeDocument).mock.calls.length
        await service.retryMaterialization(created.id)
        expect(provider.materializeDocument).toHaveBeenCalledTimes(calls)
        recovered.destroy()
        local.destroy()
    })

    it('does not replay archived documents from stale background jobs', async () => {
        const { api, service, documents, provider } = createHarness()
        const created = await api.ensureDocument({ providerKey: 'example.document', resourceId: 'resource' })
        documents[0].status = 'archived'
        documents[0].materializationStatus = 'failed'
        await service.retryMaterialization(created.id)
        expect(provider.materializeDocument).not.toHaveBeenCalled()
    })

    it('resolves retry providers in the persisted tenant without inheriting another caller', async () => {
        const { api, service, documents, provider, providers } = createHarness()
        const created = await api.ensureDocument({ providerKey: 'example.document', resourceId: 'resource' })
        documents[0].materializationStatus = 'failed'
        providers.get.mockImplementation(() => {
            expect(RequestContext.getScope().tenantId).toBe('tenant')
            expect(RequestContext.getOrganizationId()).toBe('organization')
            expect(RequestContext.currentUserId()).toBeFalsy()
            return provider
        })
        await runWithCapturedRequestContext(
            { user: null, headers: { 'tenant-id': 'unrelated', 'organization-id': 'other' } },
            async () => {
                await service.retryMaterialization(created.id)
                expect(RequestContext.getScope().tenantId).toBe('unrelated')
            }
        )
        expect(documents[0].materializationStatus).toBe('ready')
    })

    it('initializes once, applies updates monotonically, and deduplicates by hash', async () => {
        const { api, provider, updates } = createHarness()
        const created = await api.ensureDocument({ providerKey: 'example.document', resourceId: 'resource' })
        const repeated = await api.ensureDocument({ providerKey: 'example.document', resourceId: 'resource' })
        expect(repeated.id).toBe(created.id)
        expect(created.sequenceNumber).toBe(4)
        expect(provider.initializeDocument).toHaveBeenCalledTimes(1)

        const local = new Y.Doc()
        local.getMap('content').set('title', 'Collaborative')
        const updateBase64 = Buffer.from(Y.encodeStateAsUpdate(local)).toString('base64')
        const first = await api.applyUpdate({ documentId: created.id, updateBase64, origin: 'test' })
        const duplicate = await api.applyUpdate({ documentId: created.id, updateBase64, origin: 'retry' })

        expect(first.sequenceNumber).toBe(5)
        expect(first.duplicate).toBe(false)
        expect(duplicate.sequenceNumber).toBe(5)
        expect(duplicate.duplicate).toBe(true)
        expect(updates).toHaveLength(1)
        expect(provider.materializeDocument).toHaveBeenCalledTimes(1)
    })

    it('returns a true Yjs state-vector delta and rejects destructive sequence conflicts', async () => {
        const { api } = createHarness()
        const created = await api.ensureDocument({ providerKey: 'example.document', resourceId: 'resource' })
        const before = await api.getDocumentState({ documentId: created.id })

        const local = new Y.Doc()
        local.getText('body').insert(0, 'hello')
        const updateBase64 = Buffer.from(Y.encodeStateAsUpdate(local)).toString('base64')
        await api.applyUpdate({ documentId: created.id, updateBase64 })

        const delta = await api.getDocumentState({
            documentId: created.id,
            stateVectorBase64: before.stateVectorBase64
        })
        const reconstructed = new Y.Doc()
        Y.applyUpdate(reconstructed, Buffer.from(before.updateBase64, 'base64'))
        Y.applyUpdate(reconstructed, Buffer.from(delta.updateBase64, 'base64'))
        expect(reconstructed.getText('body').toString()).toBe('hello')

        // A lost acknowledgement may replay an already committed delta with its original baseline.
        expect((await api.applyUpdate({ documentId: created.id, updateBase64, expectedSequence: 4 })).duplicate).toBe(
            true
        )
        local.getText('body').insert(0, 'new ')
        const newUpdate = Buffer.from(Y.encodeStateAsUpdate(local)).toString('base64')
        await expect(
            api.applyUpdate({ documentId: created.id, updateBase64: newUpdate, expectedSequence: 4 })
        ).rejects.toThrow(/sequence conflict/i)
    })

    it('stores and removes each virtual presence independently', async () => {
        const redis = new TestRedis()
        const { api } = createHarness(redis)
        const created = await api.ensureDocument({ providerKey: 'example.document', resourceId: 'resource' })

        await api.upsertVirtualPresence({
            documentId: created.id,
            actor: { actorKey: 'agent-a', displayName: 'Agent A' },
            presence: { status: 'editing', pageId: 'page-1' }
        })
        expect(await api.listPresence({ documentId: created.id })).toEqual([
            expect.objectContaining({ actorType: 'agent', displayName: 'Agent A', status: 'editing' })
        ])

        await api.removeVirtualPresence({ documentId: created.id, actorKey: 'agent-a' })
        expect(await api.listPresence({ documentId: created.id })).toEqual([])
        expect(redis.published.some(({ message }) => message.includes('presence-remove'))).toBe(true)
    })
})

describe('archived collaboration recovery', () => {
    it('retains canonical state and sequence while enforcing manage permission and CAS', async () => {
        const { api, provider } = createHarness()
        const doc = await api.ensureDocument({ providerKey: 'example.document', resourceId: 'resource' })
        const archived = await api.archiveDocument({ documentId: doc.id, expectedSequence: 4 })
        expect(archived.status).toBe('archived')
        await expect(api.restoreDocument({ documentId: doc.id, expectedSequence: 3 })).rejects.toThrow(
            'sequence conflict'
        )
        const restored = await api.restoreDocument({ documentId: doc.id, expectedSequence: 4 })
        expect(restored).toMatchObject({ id: doc.id, status: 'active', sequenceNumber: 5 })
        expect(await api.restoreDocument({ documentId: doc.id })).toMatchObject({ sequenceNumber: 5 })
        await expect(api.restoreDocument({ documentId: doc.id, expectedSequence: 4 })).rejects.toThrow(
            'sequence conflict'
        )
        expect(provider.authorize).toHaveBeenLastCalledWith(expect.objectContaining({ operation: 'manage' }))
        jest.mocked(provider.authorize).mockReturnValue(false)
        await expect(api.archiveDocument({ documentId: doc.id })).rejects.toThrow('access was denied')
        await expect(api.restoreDocument({ documentId: doc.id })).rejects.toThrow('access was denied')
    })
    it('does not restore a deleted collaboration document', async () => {
        const { api } = createHarness()
        const doc = await api.ensureDocument({ providerKey: 'example.document', resourceId: 'resource' })
        await api.deleteDocument({ documentId: doc.id })
        await expect(api.restoreDocument({ documentId: doc.id })).rejects.toThrow('not found')
    })
})

describe('collaboration schema migration', () => {
    it('records schema upgrades with unchanged content after an ordinary update', async () => {
        const { api, provider, updates } = createHarness()
        const original = await api.ensureDocument({ providerKey: 'example.document', resourceId: 'resource' })
        const local = new Y.Doc()
        local.getText('body').insert(0, 'unchanged content')
        const updateBase64 = Buffer.from(Y.encodeStateAsUpdate(local)).toString('base64')
        local.destroy()
        await api.applyUpdate({ documentId: original.id, updateBase64 })
        const before = await api.getDocumentState({ documentId: original.id })
        provider.migrateDocument = ({ stateBase64, targetSchemaVersion }) => ({
            stateBase64,
            schemaVersion: targetSchemaVersion
        })

        await expect(
            api.migrateDocument({
                documentId: original.id,
                expectedSequence: 5,
                expectedSchemaVersion: 2,
                targetSchemaVersion: 3
            })
        ).resolves.toMatchObject({ schemaVersion: 3, sequenceNumber: 6 })
        await expect(
            api.migrateDocument({
                documentId: original.id,
                expectedSequence: 6,
                expectedSchemaVersion: 3,
                targetSchemaVersion: 4
            })
        ).resolves.toMatchObject({ schemaVersion: 4, sequenceNumber: 7 })

        expect((await api.getDocumentState({ documentId: original.id })).updateBase64).toBe(before.updateBase64)
        expect(updates).toHaveLength(3)
        expect(new Set(updates.map((entry) => entry.updateHash)).size).toBe(3)
        // Ordinary content replay must still deduplicate against the original update.
        await expect(api.applyUpdate({ documentId: original.id, updateBase64 })).resolves.toMatchObject({
            duplicate: true,
            sequenceNumber: 7
        })
        expect(updates).toHaveLength(3)
    })

    it('exposes migration through the registered runtime provider', async () => {
        const { service } = createHarness()
        const input = { documentId: 'document', expectedSequence: 4, expectedSchemaVersion: 1, targetSchemaVersion: 2 }
        const migrate = jest.spyOn(service.api, 'migrateDocument').mockRejectedValue(new Error('permission denied'))
        await expect(service.migrateDocument(input)).rejects.toThrow('permission denied')
        expect(migrate).toHaveBeenCalledWith(input)
    })
    it('keeps identity, advances the fence, records an update and invalidates old sessions', async () => {
        const { api, service, provider, updates } = createHarness()
        const original = await api.ensureDocument({ providerKey: 'example.document', resourceId: 'resource' })
        const descriptor = await api.createSession({ documentId: original.id, access: 'write' })
        const session = await service.resolveSession(descriptor.sessionId, descriptor.clientKey, original.id)
        provider.migrateDocument = jest.fn(({ targetSchemaVersion }) => {
            const doc = new Y.Doc()
            doc.getText('body').insert(0, 'preserved content')
            return {
                stateBase64: Buffer.from(Y.encodeStateAsUpdate(doc)).toString('base64'),
                schemaVersion: targetSchemaVersion
            }
        })
        const changed = await api.migrateDocument({
            documentId: original.id,
            expectedSequence: 4,
            expectedSchemaVersion: 2,
            targetSchemaVersion: 3
        })
        expect(changed).toMatchObject({ id: original.id, schemaVersion: 3, sequenceNumber: 5 })
        expect(updates.at(-1).origin).toBe('platform:schema-migration:2:3')
        await expect(service.getStateForSession(session)).rejects.toThrow()
        const stale = new Y.Doc()
        stale.getText('body').insert(0, 'stale')
        await expect(
            api.applyUpdate({
                documentId: original.id,
                expectedSchemaVersion: 2,
                updateBase64: Buffer.from(Y.encodeStateAsUpdate(stale)).toString('base64')
            })
        ).rejects.toThrow()
        const state = await api.getDocumentState({ documentId: original.id })
        const current = new Y.Doc()
        Y.applyUpdate(current, Buffer.from(state.updateBase64, 'base64'))
        expect(current.getText('body').toString()).toBe('preserved content')
    })
    it('requires manage access, matching revision and a supported increasing schema before migration', async () => {
        const { api, provider } = createHarness()
        const original = await api.ensureDocument({ providerKey: 'example.document', resourceId: 'resource' })
        provider.migrateDocument = jest.fn(() => {
            throw new Error('must not run')
        })
        const input = { documentId: original.id, expectedSequence: 4, expectedSchemaVersion: 2, targetSchemaVersion: 3 }
        await expect(api.migrateDocument({ ...input, expectedSequence: 3 })).rejects.toThrow()
        await expect(api.migrateDocument({ ...input, targetSchemaVersion: 1 })).rejects.toThrow()
        jest.mocked(provider.authorize).mockReturnValue(false)
        await expect(api.migrateDocument(input)).rejects.toThrow()
        expect(provider.migrateDocument).not.toHaveBeenCalled()
    })
    it('does not commit unsupported output or failed schema validation', async () => {
        const { api, provider, documents } = createHarness()
        const original = await api.ensureDocument({ providerKey: 'example.document', resourceId: 'resource' })
        const before = documents[0].stateBase64
        provider.migrateDocument = jest.fn(() => ({ schemaVersion: 3, stateBase64: before }))
        provider.validateDocument = jest.fn(() => {
            throw new Error('invalid schema')
        })
        await expect(
            api.migrateDocument({
                documentId: original.id,
                expectedSequence: 4,
                expectedSchemaVersion: 2,
                targetSchemaVersion: 3
            })
        ).rejects.toThrow('invalid schema')
        expect(documents[0]).toMatchObject({ schemaVersion: 2, sequenceNumber: 4, stateBase64: before })
    })
})

describe('domain operation collaboration transport', () => {
    it('reads authoritative revisions, issues operation sessions and never accepts CRDT state', async () => {
        let revision = 7
        const provider: ICollaborationOperationsProvider = {
            engine: 'operations',
            schemaVersion: 1,
            authorize: jest.fn(() => true),
            getRevision: jest.fn(() => revision)
        }
        const f = createHarness(undefined, provider),
            listener = jest.fn()
        f.service.onBroadcast(listener)
        const document = await f.api.ensureDocument({ providerKey: 'workbooks', resourceId: 'budget' })
        expect(document.engine).toBe('operations')
        expect(f.documents[0].stateBase64).toBe('')
        expect(f.updates).toHaveLength(0)
        const descriptor = await f.api.createSession({ documentId: document.id, access: 'read' })
        expect(descriptor.engine).toBe('operations')
        const session = await f.service.resolveSession(descriptor.sessionId, descriptor.clientKey, document.id)
        expect(session).toBeTruthy()
        revision = 9
        await expect(f.service.getRevisionForSession(session!)).resolves.toEqual({
            documentId: document.id,
            revision: 9
        })
        await f.api.notifyRevision!({ documentId: document.id })
        expect(listener).toHaveBeenCalledWith(
            expect.objectContaining({ type: 'revision', payload: { documentId: document.id, revision: 9 } })
        )
        await expect(f.api.getDocumentState({ documentId: document.id })).rejects.toThrow()
        const ydoc = new Y.Doc()
        ydoc.getMap('malicious').set('value', 99)
        await expect(
            f.api.applyUpdate({
                documentId: document.id,
                updateBase64: Buffer.from(Y.encodeStateAsUpdate(ydoc)).toString('base64')
            })
        ).rejects.toThrow()
        ydoc.destroy()
        expect(f.updates).toHaveLength(0)
        expect(f.documents[0].stateBase64).toBe('')
    })
    it('rechecks domain access on existing sessions and after reading the head', async () => {
        let allowed = true
        const provider: ICollaborationOperationsProvider = {
            engine: 'operations',
            schemaVersion: 1,
            authorize: () => allowed,
            getRevision: () => 1
        }
        const f = createHarness(undefined, provider)
        const document = await f.api.ensureDocument({ providerKey: 'workbooks', resourceId: 'budget' })
        const descriptor = await f.api.createSession({ documentId: document.id, access: 'read' })
        const session = await f.service.resolveSession(descriptor.sessionId, descriptor.clientKey, document.id)
        allowed = false
        await expect(f.service.getRevisionForSession(session!)).rejects.toThrow()
        await expect(f.api.notifyRevision!({ documentId: document.id })).rejects.toThrow()
        allowed = true
        provider.getRevision = () => {
            allowed = false
            return 2
        }
        await expect(f.service.getRevisionForSession(session!)).rejects.toThrow()
    })
})
