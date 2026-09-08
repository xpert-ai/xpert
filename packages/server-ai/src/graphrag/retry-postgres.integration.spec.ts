import { KBDocumentStatusEnum, KnowledgeGraphIndexJobStatus, KnowledgeGraphStatus } from '@xpert-ai/contracts'
import { randomUUID } from 'node:crypto'
import { DataSource, EntitySchema, EntitySchemaColumnOptions } from 'typeorm'
import { KnowledgeDocument } from '../knowledge-document/document.entity'
import { Knowledgebase } from '../knowledgebase/knowledgebase.entity'
import { KnowledgebaseService } from '../knowledgebase/knowledgebase.service'
import { KnowledgeGraphRetryDocumentCommand } from './commands'
import { KnowledgeGraphRetryDocumentHandler } from './commands/handlers/retry-document.handler'
import { KnowledgeGraphEntity, KnowledgeGraphIndexJob, KnowledgeGraphRelation } from './entities'
import { GraphragService } from './graphrag.service'
import { saveGraphIdentity } from './identity-write'

const postgresDescribe = process.env.KNOWLEDGE_GRAPH_PG_E2E === '1' ? describe : describe.skip
const schema = `graph_retry_test_${randomUUID().replace(/-/g, '')}`
const kbId = randomUUID()
const tenantId = randomUUID()
const orgId = randomUUID()
const docId = randomUUID()
const scope = { knowledgebaseId: kbId, tenantId, organizationId: orgId }
const columns = {
    id: { type: 'uuid', primary: true, generated: 'uuid' },
    knowledgebaseId: { type: 'uuid' },
    tenantId: { type: 'uuid' },
    organizationId: { type: 'uuid' }
} satisfies { [key: string]: EntitySchemaColumnOptions }

postgresDescribe('Graph retry PostgreSQL concurrency', () => {
    let db: DataSource
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
            extra: {
                options: `-c search_path=${schema}`,
                statement_timeout: 10000,
                max: 2,
                connectionTimeoutMillis: 700
            },
            entities: [
                new EntitySchema<Knowledgebase>({
                    name: Knowledgebase.name,
                    target: Knowledgebase,
                    tableName: 'knowledgebase',
                    columns: {
                        id: { type: 'uuid', primary: true },
                        tenantId: { type: 'uuid' },
                        organizationId: { type: 'uuid' },
                        graphRevision: { type: 'int' },
                        graphRag: { type: 'jsonb' },
                        graphStatus: { type: 'varchar', nullable: true },
                        graphIndexError: { type: 'varchar', nullable: true }
                    }
                }),
                new EntitySchema<KnowledgeGraphEntity>({
                    name: KnowledgeGraphEntity.name,
                    target: KnowledgeGraphEntity,
                    tableName: 'knowledge_graph_entity',
                    columns: {
                        ...columns,
                        name: { type: 'varchar' },
                        normalizedName: { type: 'varchar' },
                        type: { type: 'varchar' }
                    }
                }),
                new EntitySchema<KnowledgeGraphRelation>({
                    name: KnowledgeGraphRelation.name,
                    target: KnowledgeGraphRelation,
                    tableName: 'knowledge_graph_relation',
                    columns: {
                        ...columns,
                        sourceEntityId: { type: 'uuid' },
                        targetEntityId: { type: 'uuid' },
                        type: { type: 'varchar' }
                    }
                }),
                new EntitySchema<KnowledgeDocument>({
                    name: KnowledgeDocument.name,
                    target: KnowledgeDocument,
                    tableName: 'knowledge_document',
                    columns: {
                        ...columns,
                        contentHash: { type: 'varchar' },
                        publicationEpoch: { type: 'int' },
                        status: { type: 'varchar' },
                        disabled: { type: 'boolean', nullable: true },
                        hardDeletePendingAt: { type: 'timestamptz', nullable: true }
                    }
                }),
                new EntitySchema<KnowledgeGraphIndexJob>({
                    name: KnowledgeGraphIndexJob.name,
                    target: KnowledgeGraphIndexJob,
                    tableName: 'knowledge_graph_index_job',
                    columns: {
                        ...columns,
                        documentId: { type: 'uuid' },
                        type: { type: 'varchar', nullable: true },
                        processedChunks: { type: 'int', nullable: true },
                        totalChunks: { type: 'int', nullable: true },
                        error: { type: 'varchar', nullable: true },
                        dispatchError: { type: 'varchar', nullable: true },
                        completedAt: { type: 'timestamptz', nullable: true },
                        sourceContentHash: { type: 'varchar' },
                        sourcePublicationEpoch: { type: 'int' },
                        revision: { type: 'int' },
                        status: { type: 'varchar' },
                        createdAt: { type: 'timestamptz', createDate: true }
                    }
                })
            ]
        })
        await db.initialize()
        // Cross-connection races need shared tables; isolate every table in a disposable random schema.
        await db.query(`CREATE SCHEMA "${schema}"`)
        await db.synchronize()
        await db.query(`CREATE UNIQUE INDEX ON "${schema}".knowledge_graph_entity
            ("tenantId", "organizationId", "knowledgebaseId", "normalizedName", type)`)
        await db.query(`CREATE UNIQUE INDEX ON "${schema}".knowledge_graph_relation
            ("knowledgebaseId", "sourceEntityId", "targetEntityId", type)`)
    })
    afterAll(async () => {
        if (db?.isInitialized) {
            await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
            await db.destroy()
        }
    })
    beforeEach(async () => {
        for (const table of [
            'knowledgebase',
            'knowledge_graph_entity',
            'knowledge_graph_relation',
            'knowledge_document',
            'knowledge_graph_index_job'
        ]) {
            await db.query(`TRUNCATE "${schema}"."${table}"`)
        }
    })

    it('returns one entity identity to concurrent writers and subsequent reprocessing', async () => {
        const repository = db.getRepository(KnowledgeGraphEntity)
        const identity = { ...scope, normalizedName: 'information retrieval', type: 'domain' }
        const write = () =>
            saveGraphIdentity(
                repository,
                repository.create({
                    ...identity,
                    id: randomUUID(),
                    name: 'Information retrieval'
                }),
                identity
            )
        const [first, second] = await Promise.all([write(), write()])
        expect(first.id).toBe(second.id)
        expect((await write()).id).toBe(first.id)
        expect(await repository.count()).toBe(1)
    })

    it('returns one relation identity to concurrent writers', async () => {
        const repository = db.getRepository(KnowledgeGraphRelation)
        const identity = { ...scope, sourceEntityId: randomUUID(), targetEntityId: randomUUID(), type: 'belongs_to' }
        const write = () =>
            saveGraphIdentity(repository, repository.create({ ...identity, id: randomUUID() }), identity)
        const [first, second] = await Promise.all([write(), write()])
        expect(first.id).toBe(second.id)
        expect(await repository.count()).toBe(1)
    })

    async function addFailedJob() {
        await db.getRepository(Knowledgebase).save({
            id: kbId,
            tenantId,
            organizationId: orgId,
            graphRevision: 2,
            graphRag: { enabled: true }
        })
        await db.getRepository(KnowledgeDocument).save({
            ...scope,
            id: docId,
            status: KBDocumentStatusEnum.FINISH,
            contentHash: 'hash',
            publicationEpoch: 1
        })
        return db.getRepository(KnowledgeGraphIndexJob).save({
            ...scope,
            id: randomUUID(),
            documentId: docId,
            sourceContentHash: 'hash',
            sourcePublicationEpoch: 1,
            revision: 2,
            status: KnowledgeGraphIndexJobStatus.FAILED,
            createdAt: new Date('2026-01-01')
        })
    }

    it('coalesces simultaneous retry requests into one new job', async () => {
        await addFailedJob()
        const jobs = db.getRepository(KnowledgeGraphIndexJob)
        const dispatchJobs = jest.fn(async (queued: KnowledgeGraphIndexJob[]) => {
            // Use a separate connection like the queue dispatch failure/status path.
            expect(await jobs.count({ where: { id: queued[0].id } })).toBe(1)
        })
        const handler = new KnowledgeGraphRetryDocumentHandler(
            {
                findOneByIdString: async () => ({
                    id: kbId,
                    tenantId,
                    organizationId: orgId,
                    graphRevision: 2,
                    graphRag: { enabled: true }
                })
            } as unknown as KnowledgebaseService,
            { dispatchJobs } as unknown as GraphragService,
            jobs
        )
        await Promise.all(
            Array.from({ length: 8 }, () =>
                handler.execute(
                    new KnowledgeGraphRetryDocumentCommand({
                        knowledgebaseId: kbId,
                        documentId: docId
                    })
                )
            )
        )
        expect(dispatchJobs).toHaveBeenCalledTimes(1)
        expect(await jobs.count({ where: { status: KnowledgeGraphIndexJobStatus.QUEUED } })).toBe(1)
    })

    it('keeps a dispatch failure durable after the reservation transaction commits', async () => {
        await addFailedJob()
        const jobs = db.getRepository(KnowledgeGraphIndexJob)
        const graphQueue = { add: jest.fn().mockRejectedValue(new Error('queue unavailable')) }
        const graph = Object.assign(Object.create(GraphragService.prototype), {
            jobRepository: jobs,
            knowledgebaseRepository: db.getRepository(Knowledgebase),
            graphQueue
        }) as GraphragService
        const handler = new KnowledgeGraphRetryDocumentHandler(
            {
                findOneByIdString: () => db.getRepository(Knowledgebase).findOneByOrFail({ id: kbId })
            } as unknown as KnowledgebaseService,
            graph,
            jobs
        )
        const retry = () =>
            handler.execute(new KnowledgeGraphRetryDocumentCommand({ knowledgebaseId: kbId, documentId: docId }))
        await expect(retry()).rejects.toThrow('queue unavailable')
        const failed = await jobs.findOneOrFail({
            where: { documentId: docId },
            order: { createdAt: 'DESC', id: 'DESC' }
        })
        expect(failed.status).toBe(KnowledgeGraphIndexJobStatus.FAILED)
        expect(failed.dispatchError).toBe('queue unavailable')
        graphQueue.add.mockResolvedValue(undefined)
        await expect(retry()).resolves.toEqual([
            expect.objectContaining({ status: KnowledgeGraphIndexJobStatus.QUEUED })
        ])
    })

    it('retains failure history without leaving the knowledgebase failed after successful retry', async () => {
        const failed = await addFailedJob()
        const jobs = db.getRepository(KnowledgeGraphIndexJob)
        const update = jest.fn()
        const service = Object.assign(Object.create(GraphragService.prototype), {
            jobRepository: jobs,
            knowledgebaseRepository: { update }
        }) as GraphragService
        await service['updateGraphStatusFromJobs'](kbId)
        expect(update).toHaveBeenLastCalledWith(kbId, { graphStatus: KnowledgeGraphStatus.FAILED })
        await jobs.save({
            ...failed,
            id: randomUUID(),
            status: KnowledgeGraphIndexJobStatus.SUCCESS,
            createdAt: new Date()
        })
        await service['updateGraphStatusFromJobs'](kbId)
        expect(update).toHaveBeenLastCalledWith(kbId, {
            graphStatus: KnowledgeGraphStatus.READY,
            graphIndexError: null
        })
        expect(await jobs.count({ where: { status: KnowledgeGraphIndexJobStatus.FAILED } })).toBe(1)
    })
})
