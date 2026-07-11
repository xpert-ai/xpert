import type { ICollaborationDocumentProvider } from '@xpert-ai/plugin-sdk'
import * as Y from 'yjs'
import { CollaborationDocument, CollaborationUpdate } from './entities'
import { CollaborationService } from './collaboration.service'

function matches(value: Record<string, unknown>, where: Record<string, unknown>) {
    return Object.entries(where).every(([key, expected]) => value[key] === expected)
}

function createHarness() {
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
        findOneBy: async (where: Record<string, unknown>) =>
            documents.find((item) => matches(item as unknown as Record<string, unknown>, where)) ?? null,
        findOneByOrFail: async (where: Record<string, unknown>) => {
            const value = documents.find((item) => matches(item as unknown as Record<string, unknown>, where))
            if (!value) throw new Error('missing document')
            return value
        },
        update: async (id: string, patch: Partial<CollaborationDocument>) => {
            const value = documents.find((item) => item.id === id)
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
    const service = new CollaborationService(
        documentRepository as never,
        updateRepository as never,
        providers as never,
        undefined,
        undefined
    )
    const api = service.createScopedApi({ tenantId: 'tenant', organizationId: 'organization', userId: 'user' })
    return { api, documents, updates, provider }
}

describe('CollaborationService', () => {
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

        await expect(api.applyUpdate({ documentId: created.id, updateBase64, expectedSequence: 4 })).rejects.toThrow(
            /sequence conflict/i
        )
    })
})
