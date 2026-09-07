import { randomUUID } from 'node:crypto'
import { DataSource, EntitySchema, QueryRunner, Repository } from 'typeorm'
import { KnowledgeDocument } from '../../knowledge-document/document.entity'
import { KnowledgeWikiJobFenceService } from './knowledge-wiki-job-fence.service'
import { KnowledgeWikiLinkService } from './knowledge-wiki-link.service'
import { KnowledgeWikiPage, KnowledgeWikiPageLinkEntity } from './entities'

const postgresDescribe = process.env.KNOWLEDGE_WIKI_PG_E2E === '1' ? describe : describe.skip
const kbId = '00000000-0000-4000-8000-000000000001'
const sourceSchema = new EntitySchema({
    name: 'WikiSourceFixture',
    tableName: 'wiki_source_fixture',
    schema: 'pg_temp',
    columns: {
        id: { type: 'uuid', primary: true },
        knowledgebaseId: { type: 'uuid' },
        status: { type: 'varchar' },
        disabled: { type: 'boolean', nullable: true },
        deletedAt: { type: 'timestamptz', nullable: true },
        hardDeletePendingAt: { type: 'timestamptz', nullable: true },
        contentHash: { type: 'varchar' },
        sourceType: { type: 'varchar' },
        metadata: { type: 'jsonb', nullable: true }
    }
})
const pageSchema = new EntitySchema({
    name: 'WikiPageFixture',
    tableName: 'wiki_page_fixture',
    schema: 'pg_temp',
    columns: {
        id: { type: 'uuid', primary: true },
        knowledgebaseId: { type: 'uuid' },
        version: { type: 'int', version: true },
        activeVersionId: { type: 'uuid', nullable: true },
        status: { type: 'varchar' },
        projectionStatus: { type: 'varchar' },
        inboundLinkCount: { type: 'int' },
        outboundLinkCount: { type: 'int' }
    }
})
const linkSchema = new EntitySchema<KnowledgeWikiPageLinkEntity>({
    name: 'WikiLinkFixture',
    tableName: 'wiki_link_fixture',
    schema: 'pg_temp',
    columns: {
        id: { type: 'uuid', primary: true },
        knowledgebaseId: { type: 'uuid' },
        sourcePageId: { type: 'uuid' },
        sourcePageVersionId: { type: 'uuid' },
        targetPageId: { type: 'uuid' }
    },
    relations: {
        sourcePage: { type: 'many-to-one', target: 'WikiPageFixture', joinColumn: { name: 'sourcePageId' } },
        targetPage: { type: 'many-to-one', target: 'WikiPageFixture', joinColumn: { name: 'targetPageId' } }
    }
})

postgresDescribe('Wiki persistence safety', () => {
    let db: DataSource
    let runner: QueryRunner
    beforeAll(async () => {
        db = new DataSource({
            type: 'postgres',
            host: process.env.DB_HOST ?? '127.0.0.1',
            port: Number(process.env.DB_PORT ?? 5432),
            username: process.env.DB_USER ?? 'postgres',
            password: process.env.DB_PASS ?? 'ocap_password',
            database: process.env.DB_NAME ?? 'ocap',
            entities: [sourceSchema, pageSchema, linkSchema],
            synchronize: false
        })
        await db.initialize()
        runner = db.createQueryRunner()
        await runner.connect()
        // These connection-local fixtures never modify the application's tables.
        await runner.query(`CREATE TEMP TABLE wiki_source_fixture (
            id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "knowledgebaseId" uuid,
            status varchar DEFAULT 'finish', disabled boolean, "deletedAt" timestamptz,
            "hardDeletePendingAt" timestamptz, "contentHash" varchar DEFAULT 'hash',
            "sourceType" varchar DEFAULT 'file', metadata jsonb)`)
        await runner.query(`CREATE TEMP TABLE wiki_page_fixture (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            "knowledgebaseId" uuid, version int DEFAULT 4, "activeVersionId" uuid,
            status varchar DEFAULT 'ready', "projectionStatus" varchar DEFAULT 'ready',
            "inboundLinkCount" int DEFAULT 0, "outboundLinkCount" int DEFAULT 0)`)
        await runner.query(`CREATE TEMP TABLE wiki_link_fixture (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
            "knowledgebaseId" uuid, "sourcePageId" uuid, "sourcePageVersionId" uuid, "targetPageId" uuid)`)
    })
    beforeEach(async () => {
        await runner.query('TRUNCATE pg_temp.wiki_link_fixture, pg_temp.wiki_page_fixture, pg_temp.wiki_source_fixture')
    })
    afterAll(async () => {
        await runner?.release()
        await db?.destroy()
    })

    it('rebuilds sources with null or false disabled flags and excludes disabled, deleted, and system documents', async () => {
        await runner.query(
            `INSERT INTO pg_temp.wiki_source_fixture ("knowledgebaseId", disabled, "deletedAt", metadata)
            VALUES ($1, NULL, NULL, NULL), ($1, false, NULL, NULL), ($1, true, NULL, NULL),
                ($1, NULL, now(), NULL), ($1, NULL, NULL, '{"systemManaged":true}')`,
            [kbId]
        )
        const service = new KnowledgeWikiJobFenceService(
            {} as never,
            runner.manager.getRepository(sourceSchema) as unknown as Repository<KnowledgeDocument>,
            {} as never
        )
        const documents = await service.findEligibleDocuments(kbId)
        expect(documents).toHaveLength(2)
        expect(documents.map((document) => document.disabled)).toEqual([null, false])
    })

    it('updates link counts without invalidating an in-progress publication version', async () => {
        const sourceId = randomUUID(),
            targetId = randomUUID(),
            sourceVersion = randomUUID(),
            targetVersion = randomUUID()
        await runner.query(
            `INSERT INTO pg_temp.wiki_page_fixture (id, "knowledgebaseId", "activeVersionId")
            VALUES ($1, $3, $4), ($2, $3, $5)`,
            [sourceId, targetId, kbId, sourceVersion, targetVersion]
        )
        for (let i = 0; i < 3; i++) {
            await runner.query(
                `INSERT INTO pg_temp.wiki_link_fixture
                ("knowledgebaseId", "sourcePageId", "sourcePageVersionId", "targetPageId")
                VALUES ($1, $2, $4, $3), ($1, $3, $5, $2)`,
                [kbId, sourceId, targetId, sourceVersion, targetVersion]
            )
        }
        const pages = runner.manager.getRepository(pageSchema)
        const service = new KnowledgeWikiLinkService(
            pages as unknown as Repository<KnowledgeWikiPage>,
            {} as never,
            runner.manager.getRepository(linkSchema) as unknown as Repository<KnowledgeWikiPageLinkEntity>
        )
        await service.refreshCounts(kbId)
        await service.refreshCounts(kbId)
        expect(await pages.findOneBy({ knowledgebaseId: kbId })).toMatchObject({
            version: 4,
            inboundLinkCount: 3,
            outboundLinkCount: 3
        })
    })

    it('counts only active links and updates counts when a source publishes a replacement', async () => {
        const sourceId = randomUUID(),
            targetId = randomUUID()
        const oldVersion = randomUUID(),
            activeVersion = randomUUID(),
            stagedVersion = randomUUID()
        await runner.query(
            `INSERT INTO pg_temp.wiki_page_fixture (id, "knowledgebaseId", "activeVersionId")
            VALUES ($1, $3, $4), ($2, $3, $5)`,
            [sourceId, targetId, kbId, activeVersion, randomUUID()]
        )
        for (const version of [oldVersion, activeVersion, stagedVersion]) {
            await runner.query(
                `INSERT INTO pg_temp.wiki_link_fixture
                ("knowledgebaseId", "sourcePageId", "sourcePageVersionId", "targetPageId")
                VALUES ($1, $2, $3, $4)`,
                [kbId, sourceId, version, targetId]
            )
        }
        const pages = runner.manager.getRepository(pageSchema)
        const service = new KnowledgeWikiLinkService(
            pages as unknown as Repository<KnowledgeWikiPage>,
            {} as never,
            runner.manager.getRepository(linkSchema) as unknown as Repository<KnowledgeWikiPageLinkEntity>
        )
        await service.refreshCounts(kbId)
        expect(await pages.findOneBy({ id: sourceId })).toMatchObject({ outboundLinkCount: 1, version: 4 })
        expect(await pages.findOneBy({ id: targetId })).toMatchObject({ inboundLinkCount: 1, version: 4 })
        await runner.query('UPDATE pg_temp.wiki_page_fixture SET "activeVersionId" = $2 WHERE id = $1', [
            sourceId,
            randomUUID()
        ])
        await service.refreshCounts(kbId)
        expect(await pages.findOneBy({ id: sourceId })).toMatchObject({ outboundLinkCount: 0 })
        expect(await pages.findOneBy({ id: targetId })).toMatchObject({ inboundLinkCount: 0 })
        expect(await runner.manager.getRepository(linkSchema).count()).toBe(3)
    })
})
