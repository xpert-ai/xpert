import { RequestContext, type ICollaborationDocumentProvider } from '@xpert-ai/plugin-sdk'
import * as Y from 'yjs'
import { CollaborationDocument, CollaborationUpdate } from './entities'
import { CollaborationService } from './collaboration.service'
import { runWithCapturedRequestContext } from '../shared/request-context'

function matches(value: Record<string, unknown>, where: Record<string, unknown>) {
    return Object.entries(where).every(([key, expected]) => value[key] === expected)
}

function createHarness(redis?: TestRedis) {
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
    const providers = { get: jest.fn(() => provider) }
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
