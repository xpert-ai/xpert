import { randomUUID } from 'node:crypto'
import { DataSource, EntitySchema, Repository } from 'typeorm'
import { Knowledgebase } from '../knowledgebase.entity'
import { KnowledgeWikiJob, KnowledgeWikiPage } from './entities'
import { KnowledgeWikiJobDispatcherService } from './knowledge-wiki-job-dispatcher.service'
import { KnowledgeWikiProjectionService } from './knowledge-wiki-projection.service'
import { KnowledgeWikiReconcilerService } from './knowledge-wiki-reconciler.service'

const postgresDescribe = process.env.KNOWLEDGE_WIKI_PG_E2E === '1' ? describe : describe.skip
const schema = `wiki_reconcile_${randomUUID().replace(/-/g, '')}`

postgresDescribe('Wiki undispatched job recovery', () => {
    let db: DataSource
    beforeAll(async () => {
        db = new DataSource({
            type: 'postgres',
            installExtensions: false,
            host: process.env.DB_HOST ?? '127.0.0.1',
            port: Number(process.env.DB_PORT ?? 5432),
            username: process.env.DB_USER ?? 'postgres',
            password: process.env.DB_PASS ?? 'ocap_password',
            database: process.env.DB_NAME ?? 'ocap',
            schema,
            entities: [
                new EntitySchema<KnowledgeWikiJob>({
                    name: KnowledgeWikiJob.name,
                    target: KnowledgeWikiJob,
                    tableName: 'knowledgebase_wiki_job',
                    columns: {
                        id: { type: 'uuid', primary: true },
                        knowledgebaseId: { type: 'uuid' },
                        billingPrincipalId: { type: 'uuid' },
                        status: { type: 'varchar' },
                        isCurrent: { type: 'boolean' },
                        dispatchAttempts: { type: 'int' },
                        dispatchAfter: { type: 'timestamptz' },
                        dispatchError: { type: 'varchar', nullable: true },
                        error: { type: 'varchar', nullable: true },
                        leaseExpiresAt: { type: 'timestamptz', nullable: true },
                        updatedAt: { type: 'timestamptz', updateDate: true }
                    }
                })
            ]
        })
        await db.initialize()
        await db.query(`CREATE SCHEMA "${schema}"`)
        await db.synchronize()
    })
    afterAll(async () => {
        if (db?.isInitialized) {
            await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
            await db.destroy()
        }
    })
    it('recovers due jobs saved before dispatch without redispatching active, retired or future jobs', async () => {
        const jobs = db.getRepository(KnowledgeWikiJob)
        const base = {
            knowledgebaseId: randomUUID(),
            billingPrincipalId: randomUUID(),
            status: 'queued' as const,
            isCurrent: true,
            dispatchAttempts: 0,
            dispatchAfter: new Date(Date.now() - 1000)
        }
        const [missed, failed] = await jobs.save([
            { ...base, id: randomUUID() },
            { ...base, id: randomUUID(), dispatchAttempts: 1, dispatchError: 'queue unavailable' },
            { ...base, id: randomUUID(), dispatchAttempts: 1 },
            { ...base, id: randomUUID(), isCurrent: false },
            { ...base, id: randomUUID(), dispatchAfter: new Date(Date.now() + 60000) },
            { ...base, id: randomUUID(), status: 'succeeded' },
            { ...base, id: randomUUID(), status: 'running', leaseExpiresAt: new Date(Date.now() + 60000) }
        ])
        const dispatch = jest.fn(async (job: KnowledgeWikiJob) => {
            await jobs.update(job.id, { dispatchAttempts: job.dispatchAttempts + 1, dispatchError: null })
        })
        const service = new KnowledgeWikiReconcilerService(
            jobs,
            {} as Repository<KnowledgeWikiPage>,
            { find: async () => [] } as unknown as Repository<Knowledgebase>,
            { dispatch } as unknown as KnowledgeWikiJobDispatcherService,
            { retireSupersededVersions: async () => undefined } as unknown as KnowledgeWikiProjectionService
        )
        await service.reconcile()
        expect(dispatch.mock.calls.map(([job]) => job.id).sort()).toEqual([missed.id, failed.id].sort())
        await service.reconcile()
        expect(dispatch).toHaveBeenCalledTimes(2)
    })
})
