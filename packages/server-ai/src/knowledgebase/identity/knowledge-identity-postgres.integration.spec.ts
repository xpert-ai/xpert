import { KnowledgeGraphEntity } from '../../graphrag/entities'
import { KnowledgeWikiPage } from '../wiki/entities'
import { KBDocumentStatusEnum, KnowledgeIdentityDescriptor } from '@xpert-ai/contracts'
import { randomUUID } from 'node:crypto'
import { DataSource, EntitySchema, EntitySchemaColumnOptions } from 'typeorm'
import { KnowledgeDocument } from '../../knowledge-document/document.entity'
import { Knowledgebase } from '../knowledgebase.entity'
import { loadIdentityCatalogue } from './knowledge-identity-catalogue'
import { KnowledgeIdentityEmbeddingService } from './knowledge-identity-embedding.service'
import { KnowledgeIdentityObservation } from './knowledge-identity-observation.entity'
import { KnowledgeIdentity } from './knowledge-identity.entity'
import { KnowledgeIdentityService } from './knowledge-identity.service'
import { KnowledgeIdentityDedupModelInput, KnowledgeIdentityDedupModelOutput } from './knowledge-identity-model'
import {
    KnowledgeIdentityCatalogueEntry,
    KnowledgeIdentityInput,
    KnowledgeIdentitySource
} from './knowledge-identity.types'

const postgresDescribe = process.env.KNOWLEDGE_IDENTITY_PG_E2E === '1' ? describe : describe.skip
const schema = `knowledge_identity_${randomUUID().replace(/-/g, '')}`
const scopeColumns = {
    id: { type: 'uuid', primary: true, generated: 'uuid' },
    tenantId: { type: 'uuid' },
    organizationId: { type: 'uuid' },
    knowledgebaseId: { type: 'uuid' }
} satisfies { [key: string]: EntitySchemaColumnOptions }
const team: KnowledgeIdentityDescriptor = {
    kind: 'entity',
    entityType: 'organization',
    description: 'The north division operations team.',
    scope: 'north',
    identifiers: [{ namespace: 'acme/team', value: 'north' }]
}
const concept: KnowledgeIdentityDescriptor = {
    kind: 'concept',
    definition: 'Find information by equivalent meaning.',
    domain: 'information retrieval',
    scope: null
}
const candidate = (name: string, descriptor: KnowledgeIdentityDescriptor = team): KnowledgeIdentityInput => ({
    candidateKey: 'candidate',
    canonicalName: name,
    descriptor,
    aliases: [],
    facts: [{ text: name, sourceChunkIds: ['chunk'] }]
})

postgresDescribe('Shared knowledge identity persistence', () => {
    let db: DataSource
    let service: KnowledgeIdentityService
    let prepare: jest.Mock<Promise<void>, [string, KnowledgeIdentityInput, KnowledgeIdentityCatalogueEntry[]]>
    const judge = jest.fn(
        async (input: KnowledgeIdentityDedupModelInput): Promise<KnowledgeIdentityDedupModelOutput> => ({
            decision: 'same',
            identityId: input.candidates[0].id,
            reason: 'The source evidence identifies the same object.'
        })
    )
    const runtime = { judge, assertCurrent: jest.fn(async () => undefined) }
    beforeAll(async () => {
        db = new DataSource({
            type: 'postgres',
            uuidExtension: 'pgcrypto',
            installExtensions: false,
            host: process.env.DB_HOST ?? '127.0.0.1',
            port: Number(process.env.DB_PORT ?? 5432),
            username: process.env.DB_USER ?? 'postgres',
            password: process.env.DB_PASS ?? 'ocap_password',
            database: process.env.DB_NAME ?? 'ocap',
            schema,
            extra: { options: `-c search_path=${schema}`, statement_timeout: 10000 },
            entities: [
                ...[KnowledgeWikiPage, KnowledgeGraphEntity].map(
                    (target) =>
                        new EntitySchema<KnowledgeWikiPage | KnowledgeGraphEntity>({
                            name: target.name,
                            target,
                            tableName: target === KnowledgeWikiPage ? 'knowledge_wiki_page' : 'knowledge_graph_entity',
                            columns: { ...scopeColumns, identityId: { type: 'uuid' } },
                            relations: {
                                knowledgebase: {
                                    type: 'many-to-one',
                                    target: Knowledgebase.name,
                                    joinColumn: { name: 'knowledgebaseId' },
                                    onDelete: 'CASCADE'
                                },
                                identity: {
                                    type: 'many-to-one',
                                    target: KnowledgeIdentity.name,
                                    joinColumn: { name: 'identityId' },
                                    onDelete: 'NO ACTION'
                                }
                            }
                        })
                ),
                new EntitySchema<Knowledgebase>({
                    name: Knowledgebase.name,
                    target: Knowledgebase,
                    tableName: 'knowledgebase',
                    columns: {
                        id: scopeColumns.id,
                        tenantId: scopeColumns.tenantId,
                        organizationId: scopeColumns.organizationId
                    }
                }),
                new EntitySchema<KnowledgeDocument>({
                    name: KnowledgeDocument.name,
                    target: KnowledgeDocument,
                    tableName: 'knowledge_document',
                    columns: {
                        ...scopeColumns,
                        contentHash: { type: 'varchar' },
                        publicationEpoch: { type: 'int' },
                        status: { type: 'varchar' },
                        disabled: { type: 'boolean', default: false },
                        deletedAt: { type: 'timestamptz', nullable: true, deleteDate: true },
                        hardDeletePendingAt: { type: 'timestamptz', nullable: true }
                    }
                }),
                new EntitySchema<KnowledgeIdentity>({
                    name: KnowledgeIdentity.name,
                    target: KnowledgeIdentity,
                    tableName: 'knowledge_identity',
                    columns: {
                        ...scopeColumns,
                        kind: { type: 'varchar' },
                        revision: { type: 'int', default: 1 },
                        embedding: { type: 'jsonb', nullable: true }
                    },
                    relations: {
                        knowledgebase: {
                            type: 'many-to-one',
                            target: Knowledgebase.name,
                            joinColumn: { name: 'knowledgebaseId' },
                            onDelete: 'CASCADE'
                        }
                    }
                }),
                new EntitySchema<KnowledgeIdentityObservation>({
                    name: KnowledgeIdentityObservation.name,
                    target: KnowledgeIdentityObservation,
                    tableName: 'knowledge_identity_observation',
                    columns: {
                        ...scopeColumns,
                        identityId: { type: 'uuid' },
                        sourceDocumentIdSnapshot: { type: 'uuid' },
                        sourceContentHash: { type: 'varchar' },
                        sourcePublicationEpoch: { type: 'int' },
                        consumer: { type: 'varchar' },
                        extractionId: { type: 'uuid' },
                        isCurrent: { type: 'boolean', default: true },
                        sourceKey: { type: 'varchar' },
                        candidateKey: { type: 'varchar' },
                        payload: { type: 'jsonb' },
                        decision: { type: 'jsonb' },
                        createdAt: { type: 'timestamptz', createDate: true }
                    },
                    relations: {
                        sourceDocument: {
                            type: 'many-to-one',
                            target: KnowledgeDocument.name,
                            joinColumn: { name: 'sourceDocumentIdSnapshot' },
                            onDelete: 'CASCADE'
                        },
                        identity: {
                            type: 'many-to-one',
                            target: KnowledgeIdentity.name,
                            joinColumn: { name: 'identityId' },
                            onDelete: 'CASCADE'
                        }
                    },
                    uniques: [{ columns: ['knowledgebaseId', 'sourceKey'] }]
                })
            ]
        })
        await db.initialize()
        await db.query(`CREATE SCHEMA "${schema}"`)
        await db.synchronize()
    })
    afterAll(async () => {
        if (db?.isInitialized) {
            await db.query(`DROP SCHEMA "${schema}" CASCADE`)
            await db.destroy()
        }
    })
    beforeEach(() => {
        judge.mockClear()
        judge.mockImplementation(async (input) => ({
            decision: 'same',
            identityId: input.candidates[0].id,
            reason: 'Same object.'
        }))
        prepare = jest.fn(async (_kb, input, entries) => {
            input.embedding = { modelFingerprint: 'test', contentFingerprint: 'test', vector: [1, 0] }
            for (const entry of entries) entry.profile.embedding = input.embedding
        })
        service = new KnowledgeIdentityService(db, { prepare } as unknown as KnowledgeIdentityEmbeddingService)
    })

    async function source(
        consumer: 'wiki' | 'graph' = 'wiki',
        previous?: KnowledgeIdentitySource
    ): Promise<KnowledgeIdentitySource> {
        const scope = previous
            ? { id: previous.knowledgebaseId, tenantId: previous.tenantId, organizationId: previous.organizationId }
            : { id: randomUUID(), tenantId: randomUUID(), organizationId: randomUUID() }
        if (!previous) await db.getRepository(Knowledgebase).save(scope)
        const document = await db.getRepository(KnowledgeDocument).save({
            id: randomUUID(),
            knowledgebaseId: scope.id,
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            contentHash: 'hash',
            publicationEpoch: 1,
            status: KBDocumentStatusEnum.FINISH
        })
        return {
            knowledgebaseId: scope.id,
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            sourceDocumentIdSnapshot: document.id,
            sourceContentHash: 'hash',
            sourcePublicationEpoch: 1,
            consumer,
            extractionId: randomUUID()
        }
    }

    it.each(['wiki', 'graph'] as const)(
        'shares one identity when %s processes first, without a Wiki page or Graph node',
        async (first) => {
            const a = await source(first)
            const b = await source(first === 'wiki' ? 'graph' : 'wiki', a)
            const left = await service.resolve(a, candidate('Operations'), runtime)
            const right = await service.resolve(b, candidate('North Ops'), runtime)
            expect(right.identityId).toBe(left.identityId)
            expect(right.decision.outcome).toBe('same')
            expect(
                await db.getRepository(KnowledgeIdentity).count({ where: { knowledgebaseId: a.knowledgebaseId } })
            ).toBe(1)
            expect((await loadIdentityCatalogue(db.manager, a, 'entity')).entries[0].profile.aliases).toEqual([
                'Operations',
                'North Ops'
            ])
        }
    )

    it('keeps homonymous objects with conflicting issuer identifiers separate across consumers', async () => {
        const a = await source()
        const b = await source('graph', a)
        const left = await service.resolve(a, candidate('Operations'), runtime)
        const right = await service.resolve(
            b,
            candidate('Operations', { ...team, identifiers: [{ namespace: 'acme/team', value: 'south' }] }),
            runtime
        )
        expect(right.identityId).not.toBe(left.identityId)
        expect(judge).not.toHaveBeenCalled()
    })

    it('shares equivalent concepts and keeps uncertain or broader concepts separate', async () => {
        const a = await source()
        const b = await source('graph', a)
        const left = await service.resolve(a, candidate('Semantic search', concept), runtime)
        expect((await service.resolve(b, candidate('Meaning-based retrieval', concept), runtime)).identityId).toBe(
            left.identityId
        )
        judge.mockResolvedValueOnce({
            decision: 'uncertain',
            identityId: null,
            reason: 'This definition may be broader.'
        })
        const right = await service.resolve(
            { ...b, extractionId: randomUUID() },
            candidate('Information retrieval', { ...concept, definition: 'Find information using any method.' }),
            runtime
        )
        expect(right.identityId).not.toBe(left.identityId)
        expect(right.decision.outcome).toBe('uncertain')
    })

    it('reuses a persisted decision on retry without another embedding or model call', async () => {
        const a = await source('graph')
        const first = await service.resolve(a, candidate('Operations'), runtime)
        const second = await service.resolve(a, candidate('Operations'), runtime)
        expect(second.id).toBe(first.id)
        expect(prepare).toHaveBeenCalledTimes(1)
        expect(judge).not.toHaveBeenCalled()
    })

    it('replaces one consumer extraction without retaining its withdrawn aliases or removing the other consumer', async () => {
        const a = { ...(await source('graph')), extractionId: randomUUID() }
        const [old, removed] = await service.resolveBatch(
            a,
            [
                { ...candidate('Old label'), candidateKey: 'north' },
                {
                    ...candidate('Removed object', {
                        ...team,
                        identifiers: [{ namespace: 'acme/team', value: 'south' }]
                    }),
                    candidateKey: 'south'
                }
            ],
            runtime
        )
        expect(removed.identityId).not.toBe(old.identityId)
        await service.resolveBatch(
            { ...a, consumer: 'wiki', extractionId: randomUUID() },
            [candidate('Wiki label')],
            runtime
        )
        const [current] = await service.resolveBatch(
            { ...a, extractionId: randomUUID() },
            [candidate('Corrected label')],
            runtime
        )
        expect(current.identityId).toBe(old.identityId)
        const catalogue = await loadIdentityCatalogue(db.manager, a, 'entity')
        expect(catalogue.entries).toHaveLength(1)
        expect(catalogue.entries[0].profile.aliases).toEqual(expect.arrayContaining(['Wiki label', 'Corrected label']))
        expect(catalogue.entries[0].profile.aliases).not.toContain('Old label')
    })

    it('keeps the previous extraction active if a later candidate fails before replacement completes', async () => {
        const a = await source('graph')
        const old = await service.resolve(a, candidate('Original label'), runtime)
        judge.mockResolvedValueOnce({ decision: 'same', identityId: old.identityId, reason: 'Same object.' })
        judge.mockRejectedValueOnce(new Error('Provider interrupted'))
        const replacement = { ...a, extractionId: randomUUID() }
        await expect(
            service.resolveBatch(
                replacement,
                [
                    { ...candidate('Corrected label'), candidateKey: 'first' },
                    { ...candidate('Another label'), candidateKey: 'second' }
                ],
                runtime
            )
        ).rejects.toThrow('Provider interrupted')
        const catalogue = await loadIdentityCatalogue(db.manager, a, 'entity')
        expect(catalogue.entries[0].profile.aliases).toEqual(['Original label'])
        expect(
            await db
                .getRepository(KnowledgeIdentityObservation)
                .count({ where: { extractionId: replacement.extractionId } })
        ).toBe(0)
    })

    it('replays the complete batch with stable identities even when another model call would be uncertain', async () => {
        const a = await source('graph')
        judge.mockResolvedValue({ decision: 'uncertain', identityId: null, reason: 'Cannot distinguish these teams.' })
        const inputs = [
            { ...candidate('Operations', { ...team, identifiers: [] }), candidateKey: 'first' },
            { ...candidate('Operations', { ...team, identifiers: [] }), candidateKey: 'second' }
        ]
        const first = await service.resolveBatch(a, inputs, runtime)
        judge.mockRejectedValue(new Error('Replay must not call the model'))
        const replay = await service.resolveBatch(a, inputs, runtime)
        expect(replay.map((row) => row.identityId)).toEqual(first.map((row) => row.identityId))
        expect(first[0].identityId).not.toBe(first[1].identityId)
    })

    it('withdraws prior Entity and Concept evidence when the replacement has no shared candidates', async () => {
        const a = await source('wiki')
        await service.resolveBatch(
            a,
            [candidate('Operations'), { ...candidate('Search', concept), candidateKey: 'concept' }],
            runtime
        )
        await service.resolveBatch({ ...a, extractionId: randomUUID() }, [], runtime)
        expect((await loadIdentityCatalogue(db.manager, a, 'entity')).entries).toEqual([])
        expect((await loadIdentityCatalogue(db.manager, a, 'concept')).entries).toEqual([])
    })

    it('rechecks a concurrently changed catalogue before allocating another identity', async () => {
        const a = await source()
        const b = await source('graph', a)
        let released: () => void
        const gate = new Promise<void>((resolve) => {
            released = resolve
        })
        let arrivals = 0
        prepare.mockImplementation(async (_kb, input, entries) => {
            input.embedding = { modelFingerprint: 'test', contentFingerprint: 'test', vector: [1, 0] }
            for (const entry of entries) entry.profile.embedding = input.embedding
            if (++arrivals === 2) released()
            await gate
        })
        const [left, right] = await Promise.all([
            service.resolve(a, candidate('Operations'), runtime),
            service.resolve(b, candidate('North Ops'), runtime)
        ])
        expect(right.identityId).toBe(left.identityId)
        expect(await db.getRepository(KnowledgeIdentity).count({ where: { knowledgebaseId: a.knowledgebaseId } })).toBe(
            1
        )
    })

    it('removes a withdrawn source alias from matching evidence while retaining the identity used by the other consumer', async () => {
        const a = await source()
        const b = await source('graph', a)
        const left = await service.resolve(a, candidate('Obsolete name'), runtime)
        await service.resolve(b, candidate('North Ops'), runtime)
        await db.getRepository(KnowledgeDocument).update(a.sourceDocumentIdSnapshot, { disabled: true })
        const catalogue = await loadIdentityCatalogue(db.manager, b, 'entity')
        expect(catalogue.entries).toHaveLength(1)
        expect(catalogue.entries[0].id).toBe(left.identityId)
        expect(catalogue.entries[0].profile.aliases).toEqual(['North Ops'])
        await expect(service.resolve(a, candidate('Obsolete name'), runtime)).rejects.toMatchObject({ code: 'stale' })
    })

    it('does not commit a decision if the source changes during model invocation', async () => {
        const a = await source()
        const b = await source('graph', a)
        await service.resolve(a, candidate('Operations'), runtime)
        judge.mockImplementationOnce(async (input) => {
            await db.getRepository(KnowledgeDocument).update(b.sourceDocumentIdSnapshot, { publicationEpoch: 2 })
            return { decision: 'same', identityId: input.candidates[0].id, reason: 'Same object.' }
        })
        await expect(service.resolve(b, candidate('North Ops'), runtime)).rejects.toMatchObject({ code: 'stale' })
        expect(
            await db
                .getRepository(KnowledgeIdentityObservation)
                .count({ where: { sourceDocumentIdSnapshot: b.sourceDocumentIdSnapshot } })
        ).toBe(0)
    })

    it('uses same-document lineage on reprocessing without exposing withdrawn aliases as current evidence', async () => {
        const a = await source('graph')
        const first = await service.resolve(a, candidate('Old name'), runtime)
        await db
            .getRepository(KnowledgeDocument)
            .update(a.sourceDocumentIdSnapshot, { publicationEpoch: 2, contentHash: 'updated' })
        const updated = { ...a, sourcePublicationEpoch: 2, sourceContentHash: 'updated', extractionId: randomUUID() }
        const next = await service.resolve(updated, candidate('North Ops'), runtime)
        expect(next.identityId).toBe(first.identityId)
        const catalogue = await loadIdentityCatalogue(db.manager, updated, 'entity')
        expect(catalogue.entries[0].profile.aliases).toEqual(['North Ops'])
    })

    it('isolates knowledgebases and rejects a foreign identity returned by the model', async () => {
        const a = await source()
        const b = await source('graph')
        const left = await service.resolve(a, candidate('Operations'), runtime)
        const right = await service.resolve(b, candidate('Operations'), runtime)
        expect(right.identityId).not.toBe(left.identityId)
        judge.mockResolvedValueOnce({ decision: 'same', identityId: left.identityId, reason: 'Foreign candidate.' })
        await expect(
            service.resolve({ ...b, extractionId: randomUUID() }, candidate('Other name'), runtime)
        ).rejects.toMatchObject({ code: 'invalid' })
    })

    it('purges a hard-deleted document observation without deleting the independent identity', async () => {
        const a = await source('graph')
        const first = await service.resolve(a, candidate('Operations'), runtime)
        await db.getRepository(KnowledgeDocument).delete(a.sourceDocumentIdSnapshot)
        expect(
            await db
                .getRepository(KnowledgeIdentityObservation)
                .count({ where: { sourceDocumentIdSnapshot: a.sourceDocumentIdSnapshot } })
        ).toBe(0)
        expect(await db.getRepository(KnowledgeIdentity).findOneBy({ id: first.identityId })).not.toBeNull()
    })

    it('keeps identity when a projection is deleted and permits cascading deletion of the whole knowledgebase', async () => {
        const a = await source('graph')
        const observation = await service.resolve(a, candidate('Operations'), runtime)
        const projection = {
            knowledgebaseId: a.knowledgebaseId,
            tenantId: a.tenantId,
            organizationId: a.organizationId,
            identityId: observation.identityId
        }
        const wiki = await db.getRepository(KnowledgeWikiPage).save(projection)
        const graph = await db.getRepository(KnowledgeGraphEntity).save(projection)
        await db.getRepository(KnowledgeWikiPage).delete(wiki.id)
        expect(await db.getRepository(KnowledgeIdentity).findOneBy({ id: observation.identityId })).not.toBeNull()
        expect(await db.getRepository(KnowledgeGraphEntity).findOneBy({ id: graph.id })).not.toBeNull()
        await db.getRepository(Knowledgebase).delete(a.knowledgebaseId)
        expect(await db.getRepository(KnowledgeIdentity).findOneBy({ id: observation.identityId })).toBeNull()
        expect(await db.getRepository(KnowledgeGraphEntity).findOneBy({ id: graph.id })).toBeNull()
    })

    it('does not mistake identical descriptions of two distinct candidates for an idempotent retry', async () => {
        const a = await source('graph')
        judge.mockResolvedValueOnce({
            decision: 'uncertain',
            identityId: null,
            reason: 'The evidence does not distinguish the objects.'
        })
        const [first, second] = await service.resolveBatch(
            a,
            [
                { ...candidate('Operations', { ...team, identifiers: [] }), candidateKey: 'first' },
                { ...candidate('Operations', { ...team, identifiers: [] }), candidateKey: 'second' }
            ],
            runtime
        )
        expect(second.identityId).not.toBe(first.identityId)
        expect(judge).toHaveBeenCalledTimes(1)
    })
})
