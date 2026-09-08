import { randomUUID } from 'node:crypto'
import { DataSource, EntitySchema, EntitySchemaColumnOptions, UpdateEvent } from 'typeorm'
import {
    KnowledgeGraphEntity,
    KnowledgeGraphEntityContribution,
    KnowledgeGraphIndexJob,
    KnowledgeGraphRelation,
    KnowledgeGraphRelationContribution
} from './entities'
import { GraphragService } from './graphrag.service'

const postgresDescribe = process.env.KNOWLEDGE_GRAPH_PG_E2E === '1' ? describe : describe.skip
const schema = `graph_contributions_${randomUUID().replace(/-/g, '')}`
const scope = { knowledgebaseId: randomUUID(), tenantId: randomUUID(), organizationId: randomUUID() }
const common = {
    id: { type: 'uuid', primary: true, generated: 'uuid' },
    knowledgebaseId: { type: 'uuid' },
    tenantId: { type: 'uuid' },
    organizationId: { type: 'uuid' },
    description: { type: 'text', nullable: true },
    confidence: { type: 'float', nullable: true },
    revision: { type: 'int' }
} satisfies { [key: string]: EntitySchemaColumnOptions }
const identity = {
    ...common,
    type: { type: 'varchar' },
    origin: { type: 'varchar' },
    visibility: { type: 'varchar' },
    sourceFingerprint: { type: 'varchar', nullable: true }
} satisfies { [key: string]: EntitySchemaColumnOptions }
const contribution = {
    ...common,
    sourceDocumentIdSnapshot: { type: 'uuid' },
    sourceContentHash: { type: 'varchar' },
    sourcePublicationEpoch: { type: 'int' }
} satisfies { [key: string]: EntitySchemaColumnOptions }

postgresDescribe('Graph contribution concurrency', () => {
    let db: DataSource
    let service: GraphragService
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
            extra: { options: `-c search_path=${schema}`, statement_timeout: 5000 },
            entities: [
                new EntitySchema<KnowledgeGraphEntity>({
                    name: KnowledgeGraphEntity.name,
                    target: KnowledgeGraphEntity,
                    tableName: 'knowledge_graph_entity',
                    columns: {
                        ...identity,
                        name: { type: 'varchar' },
                        normalizedName: { type: 'varchar' },
                        aliases: { type: 'jsonb', nullable: true },
                        summary: { type: 'text', nullable: true }
                    },
                    uniques: [{ columns: ['tenantId', 'organizationId', 'knowledgebaseId', 'normalizedName', 'type'] }]
                }),
                new EntitySchema<KnowledgeGraphRelation>({
                    name: KnowledgeGraphRelation.name,
                    target: KnowledgeGraphRelation,
                    tableName: 'knowledge_graph_relation',
                    columns: {
                        ...identity,
                        sourceEntityId: { type: 'uuid' },
                        targetEntityId: { type: 'uuid' },
                        normalizedType: { type: 'varchar' },
                        weight: { type: 'float', nullable: true }
                    },
                    uniques: [{ columns: ['knowledgebaseId', 'sourceEntityId', 'targetEntityId', 'type'] }]
                }),
                new EntitySchema<KnowledgeGraphEntityContribution>({
                    name: KnowledgeGraphEntityContribution.name,
                    target: KnowledgeGraphEntityContribution,
                    tableName: 'knowledge_graph_entity_contribution',
                    columns: {
                        ...contribution,
                        entityId: { type: 'uuid' },
                        name: { type: 'varchar' },
                        aliases: { type: 'jsonb' }
                    },
                    uniques: [{ columns: ['entityId', 'sourceDocumentIdSnapshot'] }]
                }),
                new EntitySchema<KnowledgeGraphRelationContribution>({
                    name: KnowledgeGraphRelationContribution.name,
                    target: KnowledgeGraphRelationContribution,
                    tableName: 'knowledge_graph_relation_contribution',
                    columns: {
                        ...contribution,
                        relationId: { type: 'uuid' },
                        weight: { type: 'float', nullable: true }
                    },
                    uniques: [{ columns: ['relationId', 'sourceDocumentIdSnapshot'] }]
                })
            ]
        })
        await db.initialize()
        await db.query(`CREATE SCHEMA "${schema}"`)
        await db.synchronize()
        service = Object.assign(Object.create(GraphragService.prototype), {
            entityRepository: db.getRepository(KnowledgeGraphEntity),
            relationRepository: db.getRepository(KnowledgeGraphRelation),
            entityContributionRepository: db.getRepository(KnowledgeGraphEntityContribution),
            relationContributionRepository: db.getRepository(KnowledgeGraphRelationContribution)
        }) as GraphragService
    })
    afterAll(async () => {
        if (db?.isInitialized) {
            await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
            await db.destroy()
        }
    })
    const job = (documentId = randomUUID()) =>
        Object.assign(new KnowledgeGraphIndexJob(), {
            ...scope,
            documentId,
            sourceContentHash: 'hash',
            sourcePublicationEpoch: 1,
            revision: 1
        })

    it('retains both source aliases when the first aggregate save finishes last', async () => {
        let resume: () => void
        const held = new Promise<void>((resolve) => {
            resume = resolve
        })
        let reached: () => void
        const saving = new Promise<void>((resolve) => {
            reached = resolve
        })
        let paused = false
        const subscriber = {
            beforeUpdate: async (event: UpdateEvent<KnowledgeGraphEntity>) => {
                if (event.metadata.target === KnowledgeGraphEntity && event.entity?.sourceFingerprint && !paused) {
                    paused = true
                    reached()
                    await held
                }
            }
        }
        db.subscribers.push(subscriber)
        const name = `Concept ${randomUUID()}`
        await db.getRepository(KnowledgeGraphEntity).save({
            ...scope,
            name,
            normalizedName: name.toLowerCase(),
            type: 'concept',
            origin: 'extracted',
            visibility: 'active',
            revision: 1,
            aliases: []
        })
        const write = (alias: string) => service['upsertEntity'](job(), { name, type: 'concept', aliases: [alias] })
        const first = write('Alias A')
        let second: ReturnType<typeof write> | undefined
        try {
            await saving
            second = write('Alias B')
            // A pre-fix writer can finish here; a serialized writer waits for the first transaction.
            await Promise.race([second, new Promise((resolve) => setTimeout(resolve, 250))])
        } finally {
            resume()
            await Promise.allSettled([first, second])
            db.subscribers.splice(db.subscribers.indexOf(subscriber), 1)
        }
        const entity = await first
        await second
        const persisted = await db.getRepository(KnowledgeGraphEntity).findOneByOrFail({ id: entity.id })
        expect(persisted.aliases).toEqual(['Alias A', 'Alias B'])
        expect(persisted.summary).toContain('Alias A, Alias B')
        expect(await db.getRepository(KnowledgeGraphEntityContribution).count({ where: { entityId: entity.id } })).toBe(
            2
        )
    })

    it('does not replace a newer relation aggregate with a delayed lower-confidence source', async () => {
        const source = Object.assign(new KnowledgeGraphEntity(), { id: randomUUID() })
        const target = Object.assign(new KnowledgeGraphEntity(), { id: randomUUID() })
        await db.getRepository(KnowledgeGraphRelation).save({
            ...scope,
            sourceEntityId: source.id,
            targetEntityId: target.id,
            type: 'related',
            normalizedType: 'related',
            origin: 'extracted',
            visibility: 'active',
            revision: 1,
            confidence: 0,
            description: 'Seed'
        })
        let resume: () => void
        const held = new Promise<void>((resolve) => {
            resume = resolve
        })
        let reached: () => void
        const saving = new Promise<void>((resolve) => {
            reached = resolve
        })
        let paused = false
        const subscriber = {
            beforeUpdate: async (event: UpdateEvent<KnowledgeGraphRelation>) => {
                if (event.metadata.target === KnowledgeGraphRelation && event.entity?.sourceFingerprint && !paused) {
                    paused = true
                    reached()
                    await held
                }
            }
        }
        db.subscribers.push(subscriber)
        const write = (description: string, confidence: number) =>
            service['upsertRelation'](job(), source, target, {
                sourceName: 'Source',
                sourceType: 'concept',
                targetName: 'Target',
                targetType: 'concept',
                type: 'related',
                description,
                confidence
            })
        const first = write('Source A', 0.3)
        let second: ReturnType<typeof write> | undefined
        try {
            await saving
            second = write('Source B', 0.9)
            await Promise.race([second, new Promise((resolve) => setTimeout(resolve, 250))])
        } finally {
            resume()
            await Promise.allSettled([first, second])
            db.subscribers.splice(db.subscribers.indexOf(subscriber), 1)
        }
        const relation = await first
        await second
        const persisted = await db.getRepository(KnowledgeGraphRelation).findOneByOrFail({ id: relation.id })
        expect(persisted.description).toBe('Source B')
        expect(persisted.confidence).toBe(0.9)
        expect(persisted.weight).toBe(0.9)
    })

    it('reuses identities and keeps all entity and relation contributions on concurrent reprocessing', async () => {
        const name = `Shared ${randomUUID()}`
        const source = Object.assign(new KnowledgeGraphEntity(), { id: randomUUID() })
        const target = Object.assign(new KnowledgeGraphEntity(), { id: randomUUID() })
        const documents = Array.from({ length: 6 }, () => job())
        const write = async (input: KnowledgeGraphIndexJob, index: number) => {
            const entity = await service['upsertEntity'](input, {
                name,
                type: 'concept',
                aliases: [`Alias ${index}`],
                confidence: index / 10
            })
            const relation = await service['upsertRelation'](input, source, target, {
                sourceName: 'Source',
                sourceType: 'concept',
                targetName: 'Target',
                targetType: 'concept',
                type: 'related',
                confidence: index / 10,
                description: `Source ${index}`
            })
            return { entity, relation }
        }
        const results = await Promise.allSettled(
            documents.flatMap((input, index) => [write(input, index), write(input, index)])
        )
        const rows = results.map((result) => {
            if (result.status === 'rejected') throw result.reason
            return result.value
        })
        expect(new Set(rows.map(({ entity }) => entity.id)).size).toBe(1)
        expect(new Set(rows.map(({ relation }) => relation.id)).size).toBe(1)
        const entity = await db.getRepository(KnowledgeGraphEntity).findOneByOrFail({ id: rows[0].entity.id })
        const relation = await db.getRepository(KnowledgeGraphRelation).findOneByOrFail({ id: rows[0].relation.id })
        expect(entity.aliases).toEqual(documents.map((_, index) => `Alias ${index}`))
        expect(relation.description).toBe('Source 5')
        expect(relation.confidence).toBe(0.5)
        expect(await db.getRepository(KnowledgeGraphEntityContribution).count({ where: { entityId: entity.id } })).toBe(
            6
        )
        expect(
            await db.getRepository(KnowledgeGraphRelationContribution).count({ where: { relationId: relation.id } })
        ).toBe(6)
    })
})
