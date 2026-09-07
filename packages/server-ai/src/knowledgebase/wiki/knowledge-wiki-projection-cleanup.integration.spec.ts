import { randomUUID } from 'node:crypto'
import { DataSource, EntitySchema, QueryRunner } from 'typeorm'
import { Knowledgebase } from '../knowledgebase.entity'
import { KnowledgebaseService } from '../knowledgebase.service'
import { KnowledgeDocumentChunk } from '../../knowledge-document/chunk/chunk.entity'
import { KnowledgeWikiPage, KnowledgeWikiPageVersion } from './entities'
import { KnowledgeWikiProjectionService } from './knowledge-wiki-projection.service'

const postgresDescribe = process.env.KNOWLEDGE_WIKI_PG_E2E === '1' ? describe : describe.skip
const kbSchema = new EntitySchema<Knowledgebase>({
    name: 'CleanupKB',
    tableName: 'wiki_cleanup_kb',
    schema: 'pg_temp',
    columns: { id: { type: 'uuid', primary: true } }
})
const pageSchema = new EntitySchema<KnowledgeWikiPage>({
    name: 'CleanupPage',
    tableName: 'wiki_cleanup_page',
    schema: 'pg_temp',
    columns: {
        id: { type: 'uuid', primary: true },
        knowledgebaseId: { type: 'uuid' },
        activeVersionId: { type: 'uuid', nullable: true }
    }
})
const versionSchema = new EntitySchema<KnowledgeWikiPageVersion>({
    name: 'CleanupVersion',
    tableName: 'wiki_cleanup_version',
    schema: 'pg_temp',
    columns: {
        id: { type: 'uuid', primary: true },
        knowledgebaseId: { type: 'uuid' },
        pageId: { type: 'uuid' },
        publishedAt: { type: 'timestamptz', nullable: true },
        projectionStatus: { type: 'varchar' },
        projectionError: { type: 'text', nullable: true },
        updatedAt: { type: 'timestamptz', updateDate: true }
    },
    relations: {
        knowledgebase: { type: 'many-to-one', target: 'CleanupKB', joinColumn: { name: 'knowledgebaseId' } },
        page: { type: 'many-to-one', target: 'CleanupPage', joinColumn: { name: 'pageId' } }
    }
})
const chunkSchema = new EntitySchema<KnowledgeDocumentChunk>({
    name: 'CleanupChunk',
    tableName: 'wiki_cleanup_chunk',
    schema: 'pg_temp',
    columns: { id: { type: 'uuid', primary: true }, documentId: { type: 'uuid' }, metadata: { type: 'jsonb' } }
})

postgresDescribe('Wiki superseded projection cleanup', () => {
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
            entities: [kbSchema, pageSchema, versionSchema, chunkSchema],
            synchronize: false
        })
        await db.initialize()
        runner = db.createQueryRunner()
        await runner.connect()
        // All mutations are confined to this connection's temporary tables.
        await runner.query('CREATE TEMP TABLE wiki_cleanup_kb (id uuid PRIMARY KEY)')
        await runner.query(
            'CREATE TEMP TABLE wiki_cleanup_page (id uuid PRIMARY KEY, "knowledgebaseId" uuid, "activeVersionId" uuid)'
        )
        await runner.query(`CREATE TEMP TABLE wiki_cleanup_version (id uuid PRIMARY KEY, "knowledgebaseId" uuid, "pageId" uuid,
            "publishedAt" timestamptz, "projectionStatus" varchar, "projectionError" text, "updatedAt" timestamptz DEFAULT now())`)
        await runner.query(
            'CREATE TEMP TABLE wiki_cleanup_chunk (id uuid PRIMARY KEY, "documentId" uuid, metadata jsonb)'
        )
    })
    beforeEach(async () => {
        await runner.query(
            'TRUNCATE pg_temp.wiki_cleanup_chunk, pg_temp.wiki_cleanup_version, pg_temp.wiki_cleanup_page, pg_temp.wiki_cleanup_kb'
        )
    })
    afterAll(async () => {
        await runner?.release()
        await db?.destroy()
    })

    async function fixture() {
        const kbId = randomUUID(),
            pageId = randomUUID(),
            oldVersion = randomUUID(),
            activeVersion = randomUUID(),
            stagedVersion = randomUUID()
        await runner.query('INSERT INTO pg_temp.wiki_cleanup_kb VALUES ($1)', [kbId])
        await runner.query('INSERT INTO pg_temp.wiki_cleanup_page VALUES ($1, $2, $3)', [pageId, kbId, activeVersion])
        const vectors = new Set<string>()
        const chunkIds = new Map<string, string>()
        for (const versionId of [oldVersion, activeVersion, stagedVersion]) {
            await runner.query(
                `INSERT INTO pg_temp.wiki_cleanup_version
                (id, "knowledgebaseId", "pageId", "publishedAt", "projectionStatus") VALUES ($1, $2, $3, $4, 'ready')`,
                [versionId, kbId, pageId, versionId === stagedVersion ? null : new Date()]
            )
            const chunkId = randomUUID()
            vectors.add(chunkId)
            chunkIds.set(versionId, chunkId)
            await runner.query('INSERT INTO pg_temp.wiki_cleanup_chunk VALUES ($1, $2, $3)', [
                chunkId,
                kbId,
                {
                    chunkId: `wiki:${pageId}:${versionId}:root`,
                    contentKind: 'wiki',
                    wikiPageId: pageId,
                    wikiPageVersionId: versionId,
                    wikiPageKey: 'entity:test',
                    wikiPageType: 'entity',
                    wikiRevision: 1,
                    sectionAnchor: 'root',
                    projectionStatus: 'ready'
                }
            ])
        }
        const deleteChunks = jest.fn(async (ids: string[]) => {
            ids.forEach((id) => vectors.delete(id))
        })
        const versions = runner.manager.getRepository(versionSchema)
        const service = new KnowledgeWikiProjectionService(
            {} as never,
            runner.manager.getRepository(chunkSchema),
            versions,
            {
                findOne: async ({ where }: { where: { knowledgebaseId: string } }) => ({
                    projectionDocumentId: where.knowledgebaseId
                })
            } as never,
            {} as never,
            { getActiveVectorStore: async () => ({ deleteChunks }) } as unknown as KnowledgebaseService
        )
        return {
            service,
            kbId,
            pageId,
            oldVersion,
            activeVersion,
            stagedVersion,
            chunkIds,
            vectors,
            deleteChunks,
            versions
        }
    }

    it('removes obsolete search candidates while retaining active, staged, and historical content records', async () => {
        const f = await fixture()
        await f.service.retireSupersededVersions(f.kbId)
        expect(f.vectors.has(f.chunkIds.get(f.oldVersion))).toBe(false)
        expect(f.vectors.has(f.chunkIds.get(f.activeVersion))).toBe(true)
        expect(f.vectors.has(f.chunkIds.get(f.stagedVersion))).toBe(true)
        expect(await runner.manager.getRepository(chunkSchema).count()).toBe(2)
        expect(await f.versions.count()).toBe(3)
        expect(await f.versions.findOneBy({ id: f.oldVersion })).toMatchObject({ projectionStatus: 'disabled' })
        await f.service.retireSupersededVersions(f.kbId)
        expect(f.deleteChunks).toHaveBeenCalledTimes(1)
    })

    it('leaves a failed cleanup discoverable for a later reconciliation without disabling the current version', async () => {
        const f = await fixture()
        f.deleteChunks.mockRejectedValueOnce(new Error('vector temporarily unavailable'))
        await f.service.retireSupersededVersions(f.kbId)
        expect(await f.versions.findOneBy({ id: f.oldVersion })).toMatchObject({
            projectionStatus: 'ready',
            projectionError: 'vector temporarily unavailable'
        })
        expect(await f.versions.findOneBy({ id: f.activeVersion })).toMatchObject({ projectionStatus: 'ready' })
        await f.service.retireSupersededVersions()
        expect(await f.versions.findOneBy({ id: f.oldVersion })).toMatchObject({
            projectionStatus: 'disabled',
            projectionError: null
        })
        expect(f.vectors.size).toBe(2)
    })

    it('cleans a page with no active version and respects a requested knowledgebase scope', async () => {
        const f = await fixture()
        await runner.query('UPDATE pg_temp.wiki_cleanup_page SET "activeVersionId" = NULL WHERE id = $1', [f.pageId])
        await f.service.retireSupersededVersions(randomUUID())
        expect(f.deleteChunks).not.toHaveBeenCalled()
        await f.service.retireSupersededVersions(f.kbId)
        expect(f.vectors.size).toBe(1)
        expect(f.vectors.has(f.chunkIds.get(f.stagedVersion))).toBe(true)
    })
})
