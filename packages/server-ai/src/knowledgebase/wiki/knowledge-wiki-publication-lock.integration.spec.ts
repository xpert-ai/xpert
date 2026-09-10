import { randomUUID } from 'node:crypto'
import { DataSource, EntitySchema } from 'typeorm'
import { Knowledgebase } from '../knowledgebase.entity'
import { KnowledgeWikiJob, KnowledgeWikiPage, KnowledgeWikiPageVersion } from './entities'
import { KnowledgeWikiFinalizeService } from './knowledge-wiki-finalize.service'

const postgresDescribe = process.env.KNOWLEDGE_WIKI_PG_E2E === '1' ? describe : describe.skip
const schema = `wiki_publication_lock_${randomUUID().replace(/-/g, '')}`

postgresDescribe('Wiki publication and identity lock ordering', () => {
    let db: DataSource
    beforeAll(async () => {
        db = new DataSource({
            type: 'postgres',
            host: process.env.DB_HOST ?? '127.0.0.1',
            port: Number(process.env.DB_PORT ?? 5432),
            username: process.env.DB_USER ?? 'postgres',
            password: process.env.DB_PASS ?? 'ocap_password',
            database: process.env.DB_NAME ?? 'ocap',
            schema,
            extra: { options: `-c search_path=${schema}`, statement_timeout: 5000 },
            entities: [
                new EntitySchema<Knowledgebase>({
                    name: Knowledgebase.name,
                    target: Knowledgebase,
                    tableName: 'knowledgebase',
                    columns: {
                        id: { type: 'uuid', primary: true },
                        wikiStatus: { type: 'varchar', nullable: true },
                        wikiAvailability: { type: 'varchar', nullable: true },
                        wikiActiveRevision: { type: 'int', nullable: true },
                        wikiStagedRevision: { type: 'int', nullable: true },
                        wikiConfigFingerprint: { type: 'varchar', nullable: true },
                        wikiGeneratorVersion: { type: 'varchar', nullable: true },
                        wikiBuildError: { type: 'varchar', nullable: true }
                    }
                }),
                new EntitySchema<KnowledgeWikiPage>({
                    name: KnowledgeWikiPage.name,
                    target: KnowledgeWikiPage,
                    tableName: 'knowledgebase_wiki_page',
                    columns: {
                        id: { type: 'uuid', primary: true },
                        knowledgebaseId: { type: 'uuid' },
                        activeVersionId: { type: 'uuid', nullable: true },
                        version: { type: 'int' }
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

    it('lets identity resolution update a page while publication waits for its knowledgebase', async () => {
        const kb = await db.getRepository(Knowledgebase).save({ id: randomUUID() })
        const versionId = randomUUID()
        const page = await db.getRepository(KnowledgeWikiPage).save({
            id: randomUUID(),
            knowledgebaseId: kb.id,
            activeVersionId: versionId,
            version: 1
        })
        const job = Object.assign(new KnowledgeWikiJob(), { id: randomUUID(), knowledgebaseId: kb.id })
        const succeeded = jest.fn()
        const service = Object.assign(Object.create(KnowledgeWikiFinalizeService.prototype), {
            classification: { enqueuePublished: jest.fn() },
            jobRepository: { find: async () => [] },
            jobFence: { assert: async () => kb },
            indexService: {
                prepare: async () => [
                    {
                        page,
                        version: Object.assign(new KnowledgeWikiPageVersion(), {
                            id: versionId,
                            projectionStatus: 'ready',
                            expectedPageVersion: 1
                        })
                    }
                ]
            },
            projectionService: { retireSupersededVersions: async () => undefined },
            linkService: { refreshCounts: async () => undefined },
            dispatcher: { markSucceeded: succeeded },
            dataSource: db
        }) as KnowledgeWikiFinalizeService
        const identity = db.createQueryRunner()
        const publication = db.createQueryRunner()
        await identity.connect()
        await publication.connect()
        let publishing: Promise<void> | undefined
        try {
            await identity.startTransaction()
            await identity.query(`SET LOCAL lock_timeout = '500ms'`)
            // Identity commit owns the knowledgebase first, then updates its resolved page.
            await identity.manager.getRepository(Knowledgebase).findOneOrFail({
                where: { id: kb.id },
                lock: { mode: 'pessimistic_write' }
            })
            const [{ pid }] = await publication.query('SELECT pg_backend_pid() AS pid')
            Object.assign(service, {
                dataSource: { transaction: publication.manager.transaction.bind(publication.manager) }
            })
            publishing = service.process(job)
            // Wait until the real publication transaction is blocked, without guessing execution timing.
            let waiting = false
            for (let attempt = 0; attempt < 100; attempt++) {
                const [state] = await identity.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid = $1', [
                    pid
                ])
                if (state.wait_event_type === 'Lock') {
                    waiting = true
                    break
                }
                await new Promise((resolve) => setTimeout(resolve, 10))
            }
            expect(waiting).toBe(true)
            await identity.manager.getRepository(KnowledgeWikiPage).update(page.id, { version: 2 })
            await identity.commitTransaction()
            await publishing
            expect(succeeded).toHaveBeenCalledWith(job.id)
            expect((await db.getRepository(KnowledgeWikiPage).findOneByOrFail({ id: page.id })).version).toBe(2)
        } finally {
            if (identity.isTransactionActive) await identity.rollbackTransaction()
            await publishing?.catch(() => undefined)
            await identity.release()
            await publication.release()
        }
    })
})
