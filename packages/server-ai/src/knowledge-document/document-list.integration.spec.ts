import { DataSource, EntitySchema, FindManyOptions, QueryRunner } from 'typeorm'
import { KnowledgeDocumentController } from './document.controller'
import type { KnowledgeDocument } from './document.entity'

const postgresDescribe = process.env.KNOWLEDGE_WIKI_PG_E2E === '1' ? describe : describe.skip
const documentSchema = new EntitySchema<KnowledgeDocument>({
    name: 'DocumentListFixture',
    tableName: 'knowledge_document_list_fixture',
    columns: {
        id: { type: String, primary: true },
        knowledgebaseId: { type: String },
        name: { type: String },
        metadata: { type: 'jsonb', nullable: true }
    }
})

postgresDescribe('Ordinary document lists exclude internal index records', () => {
    let db: DataSource
    let runner: QueryRunner
    let controller: KnowledgeDocumentController

    beforeAll(async () => {
        db = new DataSource({
            type: 'postgres',
            host: process.env.DB_HOST ?? '127.0.0.1',
            port: Number(process.env.DB_PORT ?? 5432),
            username: process.env.DB_USER ?? 'postgres',
            password: process.env.DB_PASS ?? 'ocap_password',
            database: process.env.DB_NAME ?? 'ocap',
            entities: [documentSchema]
        })
        await db.initialize()
        runner = db.createQueryRunner()
        await runner.connect()
        // Connection-local fixture only: never change stored user documents or Wiki indexes.
        await runner.query(`CREATE TEMP TABLE knowledge_document_list_fixture (
            id text PRIMARY KEY, "knowledgebaseId" text, name text, metadata jsonb)`)
        await runner.query(`INSERT INTO knowledge_document_list_fixture VALUES
            ('0-internal', 'kb-1', 'Wiki', '{"systemManaged":true,"systemManagedType":"knowledge-wiki"}'),
            ('1-user-wiki', 'kb-1', 'Wiki', NULL),
            ('2-legacy', 'kb-1', 'Legacy', '{}'),
            ('3-user', 'kb-1', 'Manual', '{"systemManaged":false}'),
            ('4-internal', 'kb-1', 'Other index', '{"systemManaged":true}'),
            ('5-outside', 'kb-2', 'Outside', '{}')`)
        const repository = runner.manager.getRepository(documentSchema)
        controller = new KnowledgeDocumentController(
            {
                assertKnowledgebaseReadAccess: jest.fn(),
                findAll: async (options: FindManyOptions<KnowledgeDocument>) => {
                    const [items, total] = await repository.findAndCount(options)
                    return { items, total }
                }
            } as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never,
            {} as never
        )
    })
    afterAll(async () => {
        await runner?.release()
        await db?.destroy()
    })

    it.each(['findAll', 'pagination', 'findMyAll'] as const)(
        '%s filters before pagination and counts, without relying on selected metadata or names',
        async (method) => {
            const result = await controller[method]({
                where: { knowledgebaseId: 'kb-1' },
                select: ['id', 'name'],
                order: { id: 'ASC' },
                take: 1,
                skip: 0,
                withDeleted: false
            })
            expect(result).toEqual({ items: [{ id: '1-user-wiki', name: 'Wiki' }], total: 3 })
        }
    )

    it('uses the same filter for the count endpoint', async () => {
        expect(await controller.getCount({ knowledgebaseId: 'kb-1' })).toBe(3)
    })

    it('applies visibility to every OR branch while preserving the knowledgebase and search filters', async () => {
        const result = await controller.findAll({
            where: [
                { knowledgebaseId: 'kb-1', name: 'Wiki' },
                { knowledgebaseId: 'kb-1', name: 'Legacy' }
            ],
            order: { id: 'ASC' },
            take: 20,
            skip: 0,
            withDeleted: false
        })
        expect(result.items.map((doc) => doc.id)).toEqual(['1-user-wiki', '2-legacy'])
        expect(result.total).toBe(2)
    })

    it('keeps later pages full and preserves null-metadata filters on old documents', async () => {
        const page = await controller.pagination({
            where: { knowledgebaseId: 'kb-1' },
            order: { id: 'ASC' },
            take: 2,
            skip: 1,
            withDeleted: false
        })
        expect(page.items.map((doc) => doc.id)).toEqual(['2-legacy', '3-user'])
        expect(page.total).toBe(3)
        const legacy = await controller.findAll({
            where: { knowledgebaseId: 'kb-1', metadata: null },
            order: {},
            take: 20,
            skip: 0,
            withDeleted: false
        })
        expect(legacy.items.map((doc) => doc.id)).toEqual(['1-user-wiki'])
    })

    it('preserves caller metadata filters and cannot opt internal records into the list', async () => {
        for (const systemManaged of [false, true]) {
            const result = await controller.findAll({
                where: { knowledgebaseId: 'kb-1', metadata: { systemManaged } },
                order: {},
                take: 20,
                skip: 0,
                withDeleted: false
            })
            expect(result.items.map((doc) => doc.id)).toEqual(systemManaged ? [] : ['3-user'])
            expect(result.total).toBe(systemManaged ? 0 : 1)
        }
    })

    it('keeps source records and internal projection data available to internal readers', async () => {
        const internal = await runner.manager.getRepository(documentSchema).findOneBy({ id: '0-internal' })
        expect(internal?.metadata.systemManaged).toBe(true)
    })
})
