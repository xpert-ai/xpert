import { IKnowledgebase } from '@xpert-ai/contracts'
import { DataSource, QueryRunner } from 'typeorm'
import { queryKnowledgeWikiDocumentStatus } from './knowledge-wiki-document-status'
import { queryKnowledgeWikiDocumentProgress } from './knowledge-wiki-document-progress-query'

const postgresDescribe = process.env.KNOWLEDGE_WIKI_PG_E2E === '1' ? describe : describe.skip
const kbId = '00000000-0000-4000-8000-000000000001'
const tenantId = '00000000-0000-4000-8000-000000000002'
const orgId = '00000000-0000-4000-8000-000000000003'
const docId = '00000000-0000-4000-8000-000000000004'
const otherDocId = '00000000-0000-4000-8000-000000000005'
const pageId = '00000000-0000-4000-8000-000000000006'
const versionId = '00000000-0000-4000-8000-000000000007'
const scope = `"knowledgebaseId" uuid DEFAULT '${kbId}', "tenantId" uuid DEFAULT '${tenantId}', "organizationId" uuid DEFAULT '${orgId}'`
const kb: Pick<IKnowledgebase, 'id' | 'tenantId' | 'organizationId' | 'wikiConfig' | 'wikiAvailability'> = {
    id: kbId,
    tenantId,
    organizationId: orgId,
    wikiConfig: { enabled: true, extractionGranularity: 'standard' },
    wikiAvailability: 'ready'
}

postgresDescribe('Wiki document status PostgreSQL projection', () => {
    let db: DataSource
    let runner: QueryRunner

    beforeAll(async () => {
        db = new DataSource({
            type: 'postgres',
            host: process.env.DB_HOST ?? '127.0.0.1',
            port: Number(process.env.DB_PORT ?? 5432),
            username: process.env.DB_USER ?? 'postgres',
            password: process.env.DB_PASS ?? 'ocap_password',
            database: process.env.DB_NAME ?? 'ocap'
        })
        await db.initialize()
        runner = db.createQueryRunner()
        await runner.connect()
        // Connection-local tables shadow production names. No persistent schema or user data is changed.
        await runner.query(`CREATE TEMP TABLE knowledge_document (id uuid PRIMARY KEY, ${scope},
            "contentHash" text DEFAULT 'hash-1', status text DEFAULT 'finish', disabled boolean, "publicationEpoch" int DEFAULT 0,
            "deletedAt" timestamptz, "hardDeletePendingAt" timestamptz)`)
        await runner.query(`CREATE TEMP TABLE knowledge_wiki_source_state (${scope}, "sourceDocumentIdSnapshot" uuid,
            "lastContentHash" text DEFAULT 'hash-1', eligible boolean DEFAULT true,
            "cleanupPending" boolean DEFAULT false, "cleanupFailed" boolean DEFAULT false,
            "generationPending" boolean DEFAULT true, "generationPendingReason" text,
            "lifecycleGeneration" int DEFAULT 1, "desiredRootJobId" uuid)`)
        await runner.query(`CREATE TEMP TABLE knowledge_wiki_page (id uuid PRIMARY KEY, ${scope},
            "activeVersionId" uuid, status text DEFAULT 'ready', "projectionStatus" text DEFAULT 'ready')`)
        await runner.query(`CREATE TEMP TABLE knowledge_wiki_page_version (id uuid PRIMARY KEY, ${scope},
            "pageId" uuid, status text DEFAULT 'ready', "projectionStatus" text DEFAULT 'ready',
            "producerJobId" uuid, "generationAttempt" int DEFAULT 1)`)
        await runner.query(`CREATE TEMP TABLE knowledge_wiki_page_evidence (${scope}, "pageId" uuid,
            "pageVersionId" uuid, "sourceDocumentIdSnapshot" uuid, "sourceContentHash" text DEFAULT 'hash-1')`)
        await runner.query(`CREATE TEMP TABLE knowledge_wiki_job (id uuid PRIMARY KEY, ${scope},
            type text, status text, "isCurrent" boolean DEFAULT true, "sourceDocumentIdSnapshot" uuid,
            "sourceContentHash" text DEFAULT 'hash-1', "sourceLifecycleGeneration" int DEFAULT 1, "sourcePublicationEpoch" int DEFAULT 0,
            "parentJobId" uuid, "pageKey" text, "generationAttempt" int DEFAULT 1,
            error text, "errorCode" text, "createdAt" timestamptz DEFAULT now())`)
        await runner.query(`CREATE TEMP TABLE knowledge_wiki_source_map_result (${scope},
            "sourceJobId" uuid, "normalizedPageKey" text)`)
        await runner.query(`CREATE TEMP TABLE knowledge_wiki_model_invocation (${scope},
            "jobId" uuid, "generationAttempt" int DEFAULT 1, status text)`)
    })
    afterAll(async () => {
        await runner?.release()
        await db?.destroy()
    })
    beforeEach(async () => {
        await runner.query(`TRUNCATE pg_temp.knowledge_document, pg_temp.knowledge_wiki_source_state,
            pg_temp.knowledge_wiki_page, pg_temp.knowledge_wiki_page_version, pg_temp.knowledge_wiki_page_evidence,
            pg_temp.knowledge_wiki_job, pg_temp.knowledge_wiki_source_map_result, pg_temp.knowledge_wiki_model_invocation`)
        await runner.query('INSERT INTO pg_temp.knowledge_document (id) VALUES ($1), ($2)', [docId, otherDocId])
        await runner.query(
            'INSERT INTO pg_temp.knowledge_wiki_source_state ("sourceDocumentIdSnapshot") VALUES ($1), ($2)',
            [docId, otherDocId]
        )
        await runner.query('INSERT INTO pg_temp.knowledge_wiki_page (id, "activeVersionId") VALUES ($1, $2)', [
            pageId,
            versionId
        ])
        await runner.query('INSERT INTO pg_temp.knowledge_wiki_page_version (id, "pageId") VALUES ($1, $2)', [
            versionId,
            pageId
        ])
        await runner.query(
            `INSERT INTO pg_temp.knowledge_wiki_page_evidence ("pageId", "pageVersionId", "sourceDocumentIdSnapshot")
            VALUES ($1, $2, $3), ($1, $2, $3), ($1, $2, $4)`,
            [pageId, versionId, docId, otherDocId]
        )
    })
    const read = () => queryKnowledgeWikiDocumentStatus(runner.manager, kb, [docId])

    describe('per-document generation progress', () => {
        const mapId = '00000000-0000-4000-8000-000000000010'
        const reduceId = '00000000-0000-4000-8000-000000000011'
        const finalId = '00000000-0000-4000-8000-000000000012'
        const rootId = '00000000-0000-4000-8000-000000000013'
        const progress = async (canManage = true) =>
            queryKnowledgeWikiDocumentProgress(
                runner.manager,
                kb,
                [docId],
                (await read()).indexedDocumentIds,
                canManage
            )
        beforeEach(async () => {
            await runner.query(
                `UPDATE pg_temp.knowledge_wiki_source_state SET "desiredRootJobId" = $1
                WHERE "sourceDocumentIdSnapshot" = $2`,
                [mapId, docId]
            )
            await runner.query(
                `INSERT INTO pg_temp.knowledge_wiki_job (id, type, status, "sourceDocumentIdSnapshot")
                VALUES ($1, 'source_map', 'succeeded', $2)`,
                [mapId, docId]
            )
            await runner.query(
                `INSERT INTO pg_temp.knowledge_wiki_job (id, type, status, "parentJobId", "pageKey")
                VALUES ($1, 'page_reduce', 'succeeded', $3, 'topic'), ($2, 'finalize', 'queued', $3, NULL)`,
                [reduceId, finalId, mapId]
            )
            await runner.query(
                `UPDATE pg_temp.knowledge_wiki_page_version
                SET "producerJobId" = $1, "projectionStatus" = 'pending', status = 'building'`,
                [reduceId]
            )
        })
        it('follows map -> reduce -> index -> publish and the current invocation attempt', async () => {
            expect(await progress()).toMatchObject([{ documentId: docId, state: 'indexing' }])
            await runner.query(`UPDATE pg_temp.knowledge_wiki_page_version SET "projectionStatus" = 'ready'`)
            expect(await progress()).toMatchObject([{ state: 'publishing' }])
            await runner.query(`UPDATE pg_temp.knowledge_wiki_page_version SET status = 'ready'`)
            await runner.query(`UPDATE pg_temp.knowledge_wiki_job SET status = 'succeeded' WHERE id = $1`, [finalId])
            expect(await progress()).toMatchObject([{ state: 'ready', canView: true }])
            await runner.query(
                `UPDATE pg_temp.knowledge_wiki_job SET "generationAttempt" = 2, status = 'running' WHERE id = $1`,
                [reduceId]
            )
            await runner.query(`UPDATE pg_temp.knowledge_wiki_job SET status = 'queued' WHERE id = $1`, [finalId])
            expect(await progress()).toMatchObject([{ state: 'generating' }])
        })
        it('exposes diagnostics and uncertain-charge retry only to managers', async () => {
            await runner.query(
                `UPDATE pg_temp.knowledge_wiki_job SET status = 'failed', error = 'provider timeout'
                WHERE id = $1`,
                [reduceId]
            )
            await runner.query(
                `INSERT INTO pg_temp.knowledge_wiki_model_invocation ("jobId", status)
                VALUES ($1, 'indeterminate')`,
                [reduceId]
            )
            expect(await progress()).toMatchObject([
                {
                    state: 'failed',
                    error: 'provider timeout',
                    retry: { jobId: reduceId, requiresAdditionalChargeConfirmation: true }
                }
            ])
            const [reader] = await progress(false)
            expect(reader.state).toBe('failed')
            expect(reader).not.toHaveProperty('error')
            expect(reader).not.toHaveProperty('retry')
        })
        it('joins full-rebuild reductions by extracted topic and reports the shared barrier', async () => {
            await runner.query(
                `INSERT INTO pg_temp.knowledge_wiki_job (id, type, status) VALUES ($1, 'rebuild', 'succeeded')`,
                [rootId]
            )
            await runner.query(`UPDATE pg_temp.knowledge_wiki_job SET "parentJobId" = $1 WHERE id = ANY($2::uuid[])`, [
                rootId,
                [mapId, reduceId, finalId]
            ])
            await runner.query(
                `INSERT INTO pg_temp.knowledge_wiki_source_map_result ("sourceJobId", "normalizedPageKey")
                VALUES ($1, 'topic')`,
                [mapId]
            )
            expect(await progress()).toMatchObject([{ state: 'indexing' }])
            await runner.query(`UPDATE pg_temp.knowledge_wiki_job SET status = 'running' WHERE id = $1`, [reduceId])
            expect(await progress()).toMatchObject([{ state: 'generating', waitingForBatch: true }])
        })
        it('drops old completion on content and lifecycle changes', async () => {
            await runner.query(`UPDATE pg_temp.knowledge_document SET "contentHash" = 'hash-2' WHERE id = $1`, [docId])
            expect(await progress()).toMatchObject([{ state: 'outdated', canView: false }])
            await runner.query(`UPDATE pg_temp.knowledge_document SET status = 'error' WHERE id = $1`, [docId])
            expect(await progress()).toMatchObject([{ state: 'not_started' }])
        })
        it.each(['publicationEpoch', 'lifecycleGeneration'] as const)(
            'does not offer retry against a retired source %s',
            async (field) => {
                await runner.query(`UPDATE pg_temp.knowledge_wiki_job SET status = 'failed' WHERE id = $1`, [mapId])
                if (field === 'publicationEpoch') {
                    await runner.query(`UPDATE pg_temp.knowledge_document SET "publicationEpoch" = 2 WHERE id = $1`, [
                        docId
                    ])
                } else {
                    await runner.query(
                        `UPDATE pg_temp.knowledge_wiki_source_state SET "lifecycleGeneration" = 2
                        WHERE "sourceDocumentIdSnapshot" = $1`,
                        [docId]
                    )
                }
                const [result] = await progress()
                expect(result.state).toBe('outdated')
                expect(result).not.toHaveProperty('retry')
            }
        )
        it('does not return foreign sources or diagnostics across any scope boundary', async () => {
            for (const key of ['id', 'tenantId', 'organizationId'] as const) {
                expect(
                    await queryKnowledgeWikiDocumentProgress(
                        runner.manager,
                        { ...kb, [key]: otherDocId },
                        [docId],
                        [],
                        true
                    )
                ).toEqual([])
            }
        })
    })

    it('reports only requested sources of a published page, deduplicating evidence and accepting legacy disabled=null', async () => {
        await expect(read()).resolves.toEqual({ indexedDocumentIds: [docId] })
    })

    it.each([
        ['unpublished version', `UPDATE pg_temp.knowledge_wiki_page SET "activeVersionId" = NULL`],
        ['stale page', `UPDATE pg_temp.knowledge_wiki_page SET status = 'stale'`],
        ['building page', `UPDATE pg_temp.knowledge_wiki_page SET status = 'building'`],
        ['failed projection', `UPDATE pg_temp.knowledge_wiki_page SET "projectionStatus" = 'failed'`],
        ['failed version', `UPDATE pg_temp.knowledge_wiki_page_version SET status = 'failed'`],
        ['pending version projection', `UPDATE pg_temp.knowledge_wiki_page_version SET "projectionStatus" = 'pending'`],
        ['disabled document', `UPDATE pg_temp.knowledge_document SET disabled = true`],
        ['deleted document', `UPDATE pg_temp.knowledge_document SET "deletedAt" = now()`],
        ['pending hard delete', `UPDATE pg_temp.knowledge_document SET "hardDeletePendingAt" = now()`],
        ['reprocessing document', `UPDATE pg_temp.knowledge_document SET status = 'running'`],
        ['changed source before event delivery', `UPDATE pg_temp.knowledge_document SET "contentHash" = 'hash-2'`],
        [
            'changed source after event delivery',
            `UPDATE pg_temp.knowledge_document SET "contentHash" = 'hash-2'; UPDATE pg_temp.knowledge_wiki_source_state SET "lastContentHash" = 'hash-2'`
        ],
        ['withdrawn source', `UPDATE pg_temp.knowledge_wiki_source_state SET eligible = false`],
        ['pending cleanup', `UPDATE pg_temp.knowledge_wiki_source_state SET "cleanupPending" = true`],
        ['failed cleanup', `UPDATE pg_temp.knowledge_wiki_source_state SET "cleanupFailed" = true`],
        [
            'a different withdrawn source on the same page',
            `UPDATE pg_temp.knowledge_wiki_source_state SET eligible = false WHERE "sourceDocumentIdSnapshot" = '${otherDocId}'`
        ],
        ['foreign tenant', `UPDATE pg_temp.knowledge_wiki_page SET "tenantId" = '${otherDocId}'`],
        ['foreign organization', `UPDATE pg_temp.knowledge_wiki_page_evidence SET "organizationId" = '${otherDocId}'`],
        ['foreign knowledgebase', `UPDATE pg_temp.knowledge_wiki_page_version SET "knowledgebaseId" = '${otherDocId}'`]
    ])('does not mark %s as Wiki indexed', async (_name, mutation) => {
        await runner.query(mutation)
        await expect(read()).resolves.toEqual({ indexedDocumentIds: [] })
    })

    it('does not expose another tenant, organization or knowledgebase through the status endpoint', async () => {
        for (const key of ['id', 'tenantId', 'organizationId'] as const) {
            await expect(
                queryKnowledgeWikiDocumentStatus(runner.manager, { ...kb, [key]: otherDocId }, [docId])
            ).resolves.toEqual({ indexedDocumentIds: [] })
        }
    })

    it('keeps usable pages marked during a degraded rebuild but hides disabled or unavailable Wiki', async () => {
        await expect(
            queryKnowledgeWikiDocumentStatus(runner.manager, { ...kb, wikiAvailability: 'degraded' }, [docId])
        ).resolves.toEqual({ indexedDocumentIds: [docId] })
        await expect(
            queryKnowledgeWikiDocumentStatus(runner.manager, { ...kb, wikiAvailability: 'unavailable' }, [docId])
        ).resolves.toEqual({ indexedDocumentIds: [] })
        await expect(
            queryKnowledgeWikiDocumentStatus(
                runner.manager,
                { ...kb, wikiConfig: { ...kb.wikiConfig, enabled: false } },
                [docId]
            )
        ).resolves.toEqual({ indexedDocumentIds: [] })
    })
})
