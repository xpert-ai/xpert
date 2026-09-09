import { randomUUID } from 'node:crypto'
import {
    DataSource,
    EntitySchema,
    EntitySchemaColumnOptions,
    EntitySchemaRelationOptions,
    getMetadataArgsStorage
} from 'typeorm'
import {
    KnowledgebaseTypeEnum,
    KnowledgeWikiClassificationOutput,
    KnowledgeWikiTaxonomyOutput
} from '@xpert-ai/contracts'
import { RequestContext } from '@xpert-ai/server-core'
import { Knowledgebase } from '../knowledgebase.entity'
import {
    KnowledgeWikiPage,
    KnowledgeWikiPageVersion,
    KnowledgeWikiPageLinkEntity,
    KnowledgeWikiJob,
    KnowledgeWikiModelInvocation
} from './entities'
import {
    KnowledgeWikiFolder,
    KnowledgeWikiPlacement,
    KnowledgeWikiTaxonomy
} from './entities/knowledge-wiki-organization.entity'
import { KnowledgeWikiOrganizationService } from './knowledge-wiki-organization.service'
import { KnowledgeWikiBrowseService } from './knowledge-wiki-browse.service'
import { KnowledgeWikiClassificationService } from './knowledge-wiki-classification.service'
import { KnowledgeWikiTaxonomyService } from './knowledge-wiki-taxonomy.service'

const pgDescribe = process.env.WIKI_V15_PG_URL ? describe : describe.skip
pgDescribe('Wiki organization PostgreSQL behavior', () => {
    let fixture: Awaited<ReturnType<typeof wikiOrganizationFixture>>
    let kb: Knowledgebase
    let organization: KnowledgeWikiOrganizationService
    let browse: KnowledgeWikiBrowseService
    let classification: KnowledgeWikiClassificationService
    const model = {
        invokeClassificationModel: jest.fn<Promise<KnowledgeWikiClassificationOutput>, unknown[]>(),
        invokeTaxonomyModel: jest.fn<Promise<KnowledgeWikiTaxonomyOutput>, unknown[]>()
    }
    const access = { assertKnowledgebaseWriteAccess: jest.fn(), findOneByIdString: jest.fn() }
    beforeAll(async () => {
        fixture = await wikiOrganizationFixture(process.env.WIKI_V15_PG_URL)
    })
    afterAll(async () => {
        await fixture?.destroy()
    })
    beforeEach(async () => {
        const db = fixture.db
        await db.getRepository(Knowledgebase).deleteAll()
        kb = await db.getRepository(Knowledgebase).save({
            type: KnowledgebaseTypeEnum.Standard,
            wikiConfig: { enabled: true, extractionGranularity: 'standard' }
        })
        access.assertKnowledgebaseWriteAccess.mockImplementation((id: string) =>
            db.getRepository(Knowledgebase).findOneByOrFail({ id })
        )
        access.findOneByIdString.mockImplementation((id: string) =>
            db.getRepository(Knowledgebase).findOneByOrFail({ id })
        )
        model.invokeClassificationModel.mockReset()
        model.invokeTaxonomyModel.mockReset()
        organization = new KnowledgeWikiOrganizationService(access as never, db)
        browse = new KnowledgeWikiBrowseService(organization)
        classification = new KnowledgeWikiClassificationService(
            organization,
            model as never,
            new KnowledgeWikiTaxonomyService(organization, model as never)
        )
        jest.spyOn(RequestContext, 'currentUserId').mockReturnValue(undefined)
    })
    afterEach(() => jest.restoreAllMocks())
    async function page(title = 'Page') {
        const repo = fixture.db.getRepository(KnowledgeWikiPage)
        const page = await repo.save({ knowledgebaseId: kb.id, pageKey: randomUUID() })
        const version = await fixture.db
            .getRepository(KnowledgeWikiPageVersion)
            .save({ knowledgebaseId: kb.id, pageId: page.id, title })
        await repo.update(page.id, { activeVersionId: version.id })
        return { page: { ...page, activeVersionId: version.id }, version }
    }
    const folder = (name = 'Engineering', parentId: string | null = null) =>
        organization.saveFolder(kb.id, { name, description: 'Technical topics', parentId, position: 0 })
    it('uses the same search and type filter for folder counts, unclassified counts and pages', async () => {
        const concept = await page('Operations guide'),
            entity = await page('Operations team'),
            unclassified = await page('Operations notes'),
            f = await folder()
        await fixture.db.getRepository(KnowledgeWikiPage).update(entity.page.id, { pageType: 'entity' })
        await organization.movePage(kb.id, concept.page.id, f.id, 0)
        await organization.movePage(kb.id, entity.page.id, f.id, 0)
        const filtered = await browse.taxonomy(kb.id, { search: 'Operations', pageType: 'concept' })
        expect(filtered).toMatchObject({
            total: 2,
            unclassifiedCount: 1,
            folders: [expect.objectContaining({ pageCount: 1 })]
        })
        expect(
            (await browse.list(kb.id, { folderId: f.id, search: 'Operations', pageType: 'concept' })).items.map(
                (item) => item.id
            )
        ).toEqual([concept.page.id])
        expect(
            (await browse.list(kb.id, { unclassified: true, search: 'Operations', pageType: 'concept' })).items.map(
                (item) => item.id
            )
        ).toEqual([unclassified.page.id])
        expect(await browse.taxonomy(kb.id, { search: 'missing', pageType: 'concept' })).toMatchObject({
            total: 0,
            unclassifiedCount: 0,
            folders: [expect.objectContaining({ pageCount: 0 })]
        })
    })
    async function run() {
        const started = await classification.start(kb.id, true)
        const job = await fixture.db.getRepository(KnowledgeWikiJob).findOneByOrFail({ knowledgebaseId: kb.id })
        if (!job.classification || job.classification.mode === 'taxonomy')
            throw new Error('Expected page classification')
        await fixture.db.getRepository(KnowledgeWikiJob).update(job.id, { status: 'running', executionAttempt: 1 })
        return {
            ...job,
            classification: job.classification,
            status: 'running' as const,
            executionAttempt: 1,
            runId: started.runId
        }
    }
    async function taxonomyRun() {
        const started = await classification.start(kb.id, true)
        const repo = fixture.db.getRepository(KnowledgeWikiJob)
        const job = await repo.findOneByOrFail({ knowledgebaseId: kb.id })
        if (job.classification?.mode !== 'taxonomy') throw new Error('Expected taxonomy classification')
        await repo.update(job.id, { status: 'running', executionAttempt: 1 })
        return {
            ...job,
            classification: job.classification,
            status: 'running' as const,
            executionAttempt: 1,
            runId: started.runId
        }
    }
    it('creates model-defined directories and classifies pages in one durable run without an enable switch', async () => {
        const a = await page('Deployment'),
            b = await page('Operations'),
            manual = await page('Manual')
        await organization.movePage(kb.id, manual.page.id, null, 0)
        const job = await taxonomyRun()
        expect((await classification.start(kb.id, true)).runId).toBe(job.runId)
        expect(await fixture.db.getRepository(KnowledgeWikiJob).count()).toBe(1)
        expect(await classification.list(kb.id, job.runId)).toHaveLength(2)
        model.invokeTaxonomyModel.mockResolvedValue({
            folders: [
                {
                    name: 'Platform operations',
                    description: 'Deployment and maintenance',
                    pageIds: [a.page.id, b.page.id]
                }
            ],
            unclassifiedPageIds: []
        })
        await classification.process(job)
        const taxonomy = await browse.taxonomy(kb.id)
        expect(taxonomy).toMatchObject({
            enabled: false,
            unclassifiedCount: 1,
            folders: [expect.objectContaining({ name: 'Platform operations', pageCount: 2 })]
        })
        expect(await browse.placement(kb.id, a.page.id)).toMatchObject({
            source: 'automatic',
            folderId: taxonomy.folders[0].id
        })
        expect(await browse.placement(kb.id, manual.page.id)).toMatchObject({ source: 'manual', folderId: null })
        expect((await classification.list(kb.id, job.runId)).every((item) => item.outcome === 'applied')).toBe(true)
        expect((await classification.start(kb.id, true)).count).toBe(0)
        await classification.process(job)
        expect(model.invokeTaxonomyModel).toHaveBeenCalledTimes(1)
        expect(await fixture.db.getRepository(KnowledgeWikiPage).findOneBy({ id: a.page.id })).toMatchObject({
            version: 7,
            activeVersionId: a.version.id
        })
    })
    it('keeps pages manually moved during taxonomy generation and classifies the remaining pages', async () => {
        const a = await page('A'),
            b = await page('B'),
            job = await taxonomyRun()
        model.invokeTaxonomyModel.mockImplementation(async () => {
            await organization.movePage(kb.id, a.page.id, null, 0)
            return {
                folders: [{ name: 'Operations', description: '', pageIds: [a.page.id, b.page.id] }],
                unclassifiedPageIds: []
            }
        })
        await classification.process(job)
        expect(await browse.placement(kb.id, a.page.id)).toMatchObject({ source: 'manual', folderId: null })
        expect(await browse.placement(kb.id, b.page.id)).toMatchObject({ source: 'automatic' })
        expect((await browse.taxonomy(kb.id)).folders[0].pageCount).toBe(1)
        expect((await classification.list(kb.id, job.runId)).find((item) => item.pageId === a.page.id)?.status).toBe(
            'stale'
        )
    })
    it('discards generated directories when the user has created a directory while the model was running', async () => {
        const a = await page(),
            job = await taxonomyRun()
        model.invokeTaxonomyModel.mockImplementation(async () => {
            await folder('Manual directory')
            return {
                folders: [{ name: 'Model directory', description: '', pageIds: [a.page.id] }],
                unclassifiedPageIds: []
            }
        })
        await classification.process(job)
        expect((await browse.taxonomy(kb.id)).folders.map((folder) => folder.name)).toEqual(['Manual directory'])
        expect(await browse.placement(kb.id, a.page.id)).toBeUndefined()
        expect((await classification.list(kb.id))[0].status).toBe('stale')
    })
    it.each([false, true])(
        'does not repeat unmatched pages after taxonomy generation (creates folders: %s)',
        async (matched) => {
            const b = matched ? await page('Matched') : null
            const a = await page(),
                job = await taxonomyRun()
            model.invokeTaxonomyModel.mockResolvedValue({
                folders: b ? [{ name: 'Operations', description: '', pageIds: [b.page.id] }] : [],
                unclassifiedPageIds: [a.page.id]
            })
            await classification.process(job)
            expect(await browse.placement(kb.id, a.page.id)).toMatchObject({
                source: 'automatic',
                folderId: null,
                version: 1
            })
            expect((await classification.start(kb.id, true)).count).toBe(0)
            expect((await classification.list(kb.id)).find((item) => item.pageId === a.page.id)?.outcome).toBe(
                'unclassified'
            )
        }
    )
    it('creates a bounded first taxonomy batch and uses its folders for remaining pages', async () => {
        await Promise.all(Array.from({ length: 101 }, (_, index) => page(`Page ${index}`)))
        const first = await classification.start(kb.id, true)
        expect(first).toMatchObject({ count: 100, truncated: true })
        const job = await taxonomyRun()
        expect(job.classification.pages).toHaveLength(100)
        model.invokeTaxonomyModel.mockResolvedValue({
            folders: [
                { name: 'Operations', description: '', pageIds: job.classification.pages.map((page) => page.pageId) }
            ],
            unclassifiedPageIds: []
        })
        await classification.process(job)
        expect((await classification.start(kb.id, true)).count).toBe(1)
        expect((await browse.taxonomy(kb.id)).folders[0].pageCount).toBe(100)
    })
    it('persists hierarchy, rejects cycles, duplicates, nonempty deletion, and stale edits', async () => {
        const root = await folder(),
            child = await folder('Runbooks', root.id)
        expect((await browse.taxonomy(kb.id)).folders).toEqual(
            expect.arrayContaining([expect.objectContaining({ id: child.id, parentId: root.id })])
        )
        await expect(
            organization.saveFolder(
                kb.id,
                { name: 'Root', description: '', parentId: child.id, position: 0 },
                root.id,
                root.version
            )
        ).rejects.toThrow()
        await expect(folder(' engineering ')).rejects.toThrow()
        await expect(organization.deleteFolder(kb.id, root.id, root.version)).rejects.toThrow()
        await organization.saveFolder(
            kb.id,
            { name: 'Operations', description: '', parentId: root.id, position: 1 },
            child.id,
            child.version
        )
        await expect(organization.deleteFolder(kb.id, child.id, child.version)).rejects.toThrow()
    })
    it('serializes manual placement revisions without changing the page body version', async () => {
        const { page: p } = await page(),
            f = await folder()
        const attempts = await Promise.allSettled([
            organization.movePage(kb.id, p.id, f.id, 0),
            organization.movePage(kb.id, p.id, null, 0)
        ])
        expect(attempts.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
        expect(attempts.filter((r) => r.status === 'rejected')).toHaveLength(1)
        expect(await fixture.db.getRepository(KnowledgeWikiPage).findOneBy({ id: p.id })).toMatchObject({
            version: 7,
            activeVersionId: p.activeVersionId
        })
        expect(await browse.placement(kb.id, p.id)).toMatchObject({ source: 'manual', version: 1 })
    })
    it('rejects cross-knowledgebase placement targets and honors write access before database work', async () => {
        const { page: p } = await page(),
            f = await folder()
        const other = await fixture.db
            .getRepository(Knowledgebase)
            .save({ type: KnowledgebaseTypeEnum.Standard, wikiConfig: { enabled: true } })
        await expect(organization.movePage(other.id, p.id, f.id, 0)).rejects.toThrow()
        access.assertKnowledgebaseWriteAccess.mockRejectedValueOnce(new Error('denied'))
        await expect(organization.movePage(kb.id, p.id, f.id, 0)).rejects.toThrow('denied')
        expect(await fixture.db.getRepository(KnowledgeWikiPlacement).count()).toBe(0)
    })
    it('uses readable active pages for folders, pagination and graph endpoints, excluding obsolete edges', async () => {
        const a = await page('A'),
            b = await page('B'),
            hidden = await page('Hidden'),
            f = await folder()
        await organization.movePage(kb.id, a.page.id, f.id, 0)
        const identityId = randomUUID()
        await fixture.db.getRepository(KnowledgeWikiPage).update(a.page.id, { identityId })
        const document = randomUUID()
        await fixture.db
            .getRepository('WikiSourceTest')
            .save({ knowledgebaseId: kb.id, sourceDocumentIdSnapshot: document, eligible: false })
        await fixture.db
            .getRepository('WikiEvidenceTest')
            .save({ knowledgebaseId: kb.id, pageVersionId: hidden.version.id, sourceDocumentIdSnapshot: document })
        const links = fixture.db.getRepository(KnowledgeWikiPageLinkEntity)
        await links.save({
            knowledgebaseId: kb.id,
            sourcePageId: a.page.id,
            sourcePageVersionId: a.version.id,
            targetPageId: b.page.id
        })
        const old = await fixture.db
            .getRepository(KnowledgeWikiPageVersion)
            .save({ knowledgebaseId: kb.id, pageId: a.page.id, title: 'Old' })
        await links.save({
            knowledgebaseId: kb.id,
            sourcePageId: a.page.id,
            sourcePageVersionId: old.id,
            targetPageId: b.page.id
        })
        await links.save({
            knowledgebaseId: kb.id,
            sourcePageId: a.page.id,
            sourcePageVersionId: a.version.id,
            targetPageId: hidden.page.id
        })
        expect((await browse.list(kb.id, { folderId: f.id })).items.map((p) => p.id)).toEqual([a.page.id])
        expect((await browse.list(kb.id, { unclassified: true })).items.map((p) => p.id)).toEqual([b.page.id])
        expect(await browse.list(kb.id, { take: 1, skip: 1 })).toMatchObject({ total: 2, items: [expect.any(Object)] })
        expect(await browse.taxonomy(kb.id)).toMatchObject({
            total: 2,
            unclassifiedCount: 1,
            folders: [expect.objectContaining({ pageCount: 1 })]
        })
        const graph = await browse.graph(kb.id, { focusPageId: a.page.id })
        expect(graph.nodes.find((node) => node.id === a.page.id)?.identityId).toBe(identityId)
        expect((await browse.list(kb.id, { folderId: f.id })).items[0].identityId).toBe(identityId)
        expect(graph.nodes).toHaveLength(2)
        expect(graph.edges).toHaveLength(1)
        expect(graph.edges[0]).toMatchObject({ source: a.page.id, target: b.page.id })
        expect(await browse.graph(kb.id, { take: 1 })).toMatchObject({ truncated: true, edges: [] })
        await fixture.db
            .getRepository('WikiSourceTest')
            .update({ knowledgebaseId: kb.id }, { eligible: true, lastContentHash: 'changed' })
        expect((await browse.list(kb.id, {})).total).toBe(2)
    })
    it('automatically queues publication without a separate switch and preserves manual placement', async () => {
        const a = await page(),
            b = await page(),
            f = await folder()
        const parent = Object.assign(new KnowledgeWikiJob(), { id: randomUUID() })
        await fixture.db.transaction((manager) => classification.enqueuePublished(manager, kb, parent, [a]))
        expect(await fixture.db.getRepository(KnowledgeWikiJob).count()).toBe(1)
        await organization.movePage(kb.id, b.page.id, f.id, 0)
        for (let i = 0; i < 2; i++)
            await fixture.db.transaction((manager) => classification.enqueuePublished(manager, kb, parent, [a, b]))
        const jobs = await fixture.db.getRepository(KnowledgeWikiJob).find()
        expect(jobs).toHaveLength(1)
        expect(jobs[0]).toMatchObject({
            status: 'queued',
            dispatchAttempts: 0,
            classification: { pageId: a.page.id, applyAutomatically: true }
        })
    })
    it('bootstraps a new library after publication and retains pages published during the model call', async () => {
        const a = await page('First publication')
        const parent = Object.assign(new KnowledgeWikiJob(), { id: randomUUID(), billingPrincipalId: randomUUID() })
        await fixture.db.getRepository('User').save({ id: parent.billingPrincipalId })
        await fixture.db.transaction((manager) => classification.enqueuePublished(manager, kb, parent, [a]))
        const repo = fixture.db.getRepository(KnowledgeWikiJob)
        const bootstrap = await repo.findOneByOrFail({ knowledgebaseId: kb.id })
        expect(bootstrap).toMatchObject({
            billingPrincipalId: parent.billingPrincipalId,
            classification: { mode: 'taxonomy' }
        })
        await repo.update(bootstrap.id, { status: 'running', executionAttempt: 1 })
        const b = await page('Published during classification')
        const manual = await page('Manual')
        const nextParent = Object.assign(new KnowledgeWikiJob(), { id: randomUUID(), billingPrincipalId: randomUUID() })
        await fixture.db.getRepository('User').save({ id: nextParent.billingPrincipalId })
        model.invokeTaxonomyModel.mockImplementation(async () => {
            await fixture.db.transaction((manager) =>
                classification.enqueuePublished(manager, kb, nextParent, [a, b, manual])
            )
            await organization.movePage(kb.id, manual.page.id, null, 0)
            return {
                folders: [{ name: 'Knowledge', description: 'Published knowledge', pageIds: [a.page.id] }],
                unclassifiedPageIds: []
            }
        })
        await classification.process({ ...bootstrap, status: 'running', executionAttempt: 1 })
        const taxonomy = await browse.taxonomy(kb.id)
        expect(taxonomy.folders).toHaveLength(1)
        expect(await browse.placement(kb.id, a.page.id)).toMatchObject({ folderId: taxonomy.folders[0].id })
        const jobs = await repo.findBy({ status: 'queued' })
        expect(jobs).toHaveLength(1)
        expect(jobs[0]).toMatchObject({
            billingPrincipalId: nextParent.billingPrincipalId,
            classification: { pageId: b.page.id, taxonomyRevision: taxonomy.revision }
        })
        await repo.update(jobs[0].id, { status: 'running', executionAttempt: 1 })
        model.invokeClassificationModel.mockResolvedValue({ folderId: taxonomy.folders[0].id, reason: 'Matches' })
        await classification.process({ ...jobs[0], status: 'running', executionAttempt: 1 })
        expect(await browse.placement(kb.id, b.page.id)).toMatchObject({
            source: 'automatic',
            folderId: taxonomy.folders[0].id
        })
        expect(await browse.placement(kb.id, manual.page.id)).toMatchObject({ source: 'manual', folderId: null })
        expect(model.invokeTaxonomyModel).toHaveBeenCalledTimes(1)
    })
    it('groups entities and concepts as knowledge and filters summaries consistently', async () => {
        const entity = await page('Entity'),
            concept = await page('Concept'),
            summary = await page('Summary'),
            index = await page('Index')
        await fixture.db.getRepository(KnowledgeWikiPage).update(entity.page.id, { pageType: 'entity' })
        await fixture.db.getRepository(KnowledgeWikiPage).update(summary.page.id, { pageType: 'summary' })
        await fixture.db.getRepository(KnowledgeWikiPage).update(index.page.id, { pageType: 'index' })
        expect((await browse.list(kb.id, { pageGroup: 'knowledge' })).items.map((item) => item.id).sort()).toEqual(
            [entity.page.id, concept.page.id].sort()
        )
        expect(await browse.taxonomy(kb.id, { pageGroup: 'knowledge' })).toMatchObject({
            total: 2,
            unclassifiedCount: 2
        })
        expect((await browse.list(kb.id, { pageGroup: 'summary' })).items.map((item) => item.id)).toEqual([
            summary.page.id
        ])
        expect(await browse.taxonomy(kb.id, { pageGroup: 'summary' })).toMatchObject({ total: 1, unclassifiedCount: 1 })
    })
    it('reports durable active job counts regardless of the recent result limit', async () => {
        await page()
        await folder()
        const job = await run()
        const repo = fixture.db.getRepository(KnowledgeWikiJob)
        const template = await repo.findOneByOrFail({ id: job.id })
        await repo.insert(
            Array.from({ length: 105 }, (_, index) => ({
                ...template,
                id: randomUUID(),
                jobKey: `historical:${index}`,
                status: 'succeeded',
                createdAt: new Date(Date.now() + 1000)
            }))
        )
        expect(await classification.status(kb.id)).toEqual({ activeJobs: 1 })
        expect((await classification.list(kb.id)).some((item) => item.jobId === job.id)).toBe(false)
        await repo.update(job.id, { status: 'succeeded' })
        expect(await classification.status(kb.id)).toEqual({ activeJobs: 0 })
    })
    it('directly classifies historical pages with new-page automation off, without changing body versions', async () => {
        const { page: p } = await page(),
            f = await folder(),
            job = await run()
        model.invokeClassificationModel.mockResolvedValue({ folderId: f.id, reason: 'Technical content' })
        await classification.process(job)
        expect((await browse.taxonomy(kb.id)).enabled).toBe(false)
        expect(await browse.placement(kb.id, p.id)).toMatchObject({ folderId: f.id, source: 'automatic', version: 1 })
        expect((await classification.list(kb.id, job.runId))[0]).toMatchObject({
            status: 'succeeded',
            outcome: 'applied'
        })
        await classification.apply(kb.id, [job.id])
        await classification.apply(kb.id, [job.id])
        expect(await browse.placement(kb.id, p.id)).toMatchObject({ folderId: f.id, source: 'automatic', version: 1 })
        expect(await fixture.db.getRepository(KnowledgeWikiPage).findOneBy({ id: p.id })).toMatchObject({ version: 7 })
    })
    it.each(['manual', 'taxonomy', 'page', 'disabled'] as const)(
        'discards a result if %s changes during the model call',
        async (change) => {
            const { page: p } = await page(),
                f = await folder(),
                job = await run()
            model.invokeClassificationModel.mockImplementation(async () => {
                if (change === 'manual') await organization.movePage(kb.id, p.id, null, 0)
                if (change === 'taxonomy') await folder('New directory')
                if (change === 'page')
                    await fixture.db.getRepository(KnowledgeWikiPage).update(p.id, { activeVersionId: randomUUID() })
                if (change === 'disabled')
                    await fixture.db.getRepository(Knowledgebase).update(kb.id, { wikiConfig: { enabled: false } })
                return { folderId: f.id, reason: 'Result' }
            })
            await classification.process(job)
            expect(await fixture.db.getRepository(KnowledgeWikiJob).findOneBy({ id: job.id })).toMatchObject({
                status: 'stale'
            })
            expect(
                (await fixture.db.getRepository(KnowledgeWikiPlacement).findOneBy({ pageId: p.id }))?.folderId
            ).not.toBe(f.id)
        }
    )
    it('rejects stale previews after a manual move and omits them from actionable suggestions', async () => {
        const { page: p } = await page(),
            f = await folder(),
            job = await run()
        job.classification = { ...job.classification, applyAutomatically: false, trigger: undefined }
        await fixture.db.getRepository(KnowledgeWikiJob).update(job.id, { classification: job.classification })
        model.invokeClassificationModel.mockResolvedValue({ folderId: f.id, reason: 'Result' })
        await classification.process(job)
        await organization.movePage(kb.id, p.id, null, 0)
        expect((await classification.list(kb.id))[0]).toMatchObject({ status: 'stale' })
        await expect(classification.apply(kb.id, [job.id])).rejects.toThrow()
        expect(await browse.placement(kb.id, p.id)).toMatchObject({ folderId: null, source: 'manual' })
    })
    it('backfills only eligible pages and preserves assigned pages and manual unclassified placement', async () => {
        const eligible = await page(),
            manual = await page(),
            assigned = await page(),
            f = await folder()
        await organization.movePage(kb.id, manual.page.id, null, 0)
        await fixture.db.getRepository(KnowledgeWikiPlacement).save({
            knowledgebaseId: kb.id,
            pageId: assigned.page.id,
            folderId: f.id,
            source: 'automatic',
            version: 1
        })
        const started = await classification.start(kb.id, true)
        expect(started.count).toBe(1)
        const jobs = await fixture.db.getRepository(KnowledgeWikiJob).find()
        expect(jobs).toHaveLength(1)
        expect(jobs[0].classification).toMatchObject({
            pageId: eligible.page.id,
            applyAutomatically: true,
            trigger: 'backfill'
        })
    })
    it('can backfill a page with an unapplied legacy suggestion', async () => {
        const { page: p } = await page(),
            f = await folder(),
            job = await run()
        job.classification = { ...job.classification, applyAutomatically: false, trigger: undefined }
        await fixture.db.getRepository(KnowledgeWikiJob).update(job.id, { classification: job.classification })
        model.invokeClassificationModel.mockResolvedValue({ folderId: f.id, reason: 'Legacy result' })
        await classification.process(job)
        expect(await browse.placement(kb.id, p.id)).toBeUndefined()
        expect((await classification.start(kb.id, true)).count).toBe(1)
    })
    it('skips matching active and completed backfill jobs, including no-match results', async () => {
        await page()
        await folder()
        const job = await run()
        expect((await classification.start(kb.id, true)).count).toBe(0)
        model.invokeClassificationModel.mockResolvedValue({ folderId: null, reason: 'No matching directory' })
        await classification.process(job)
        expect((await classification.start(kb.id, true)).count).toBe(0)
        await classification.apply(kb.id, [job.id])
        expect((await classification.start(kb.id, true)).count).toBe(0)
        expect((await classification.start(kb.id, false)).count).toBe(1)
    })
    it('clears an obsolete automatic placement when a new publication no longer matches any directory', async () => {
        const a = await page(),
            f = await folder()
        await fixture.db
            .getRepository(KnowledgeWikiPlacement)
            .save({ knowledgebaseId: kb.id, pageId: a.page.id, folderId: f.id, source: 'automatic', version: 1 })
        await organization.configure(kb.id, true, (await browse.taxonomy(kb.id)).revision)
        await fixture.db.transaction((m) =>
            classification.enqueuePublished(m, kb, Object.assign(new KnowledgeWikiJob(), { id: randomUUID() }), [a])
        )
        const repo = fixture.db.getRepository(KnowledgeWikiJob),
            job = await repo.findOneByOrFail({ knowledgebaseId: kb.id })
        await repo.update(job.id, { status: 'running' })
        model.invokeClassificationModel.mockResolvedValue({ folderId: null, reason: 'No longer fits' })
        await classification.process({ ...job, status: 'running' })
        expect(await browse.placement(kb.id, a.page.id)).toMatchObject({
            source: 'automatic',
            folderId: null,
            version: 2
        })
    })
    it('synchronizes the v1.5 entities into an existing schema without changing Wiki pages', async () => {
        const a = await page()
        await fixture.db.query(
            'DROP TABLE knowledge_wiki_placement, knowledge_wiki_folder, knowledge_wiki_taxonomy CASCADE'
        )
        await fixture.db.query('ALTER TABLE knowledge_wiki_job DROP COLUMN classification')
        await fixture.db.synchronize()
        expect((await fixture.db.driver.createSchemaBuilder().log()).upQueries).toEqual([])
        const created = await folder()
        await organization.movePage(kb.id, a.page.id, created.id, 0)
        expect(await fixture.db.getRepository(KnowledgeWikiPage).findOneBy({ id: a.page.id })).toMatchObject({
            version: 7,
            activeVersionId: a.version.id
        })
    })
})

const idColumn = { type: 'uuid', primary: true, generated: 'uuid' } as const
const scopeColumns = {
    tenantId: { type: 'uuid', nullable: true },
    organizationId: { type: 'uuid', nullable: true },
    knowledgebaseId: { type: 'uuid' }
} as const
const kbSchema = new EntitySchema<Knowledgebase>({
    name: 'Knowledgebase',
    target: Knowledgebase,
    tableName: 'knowledgebase',
    columns: {
        id: idColumn,
        tenantId: { type: 'uuid', nullable: true },
        organizationId: { type: 'uuid', nullable: true },
        type: { type: 'varchar' },
        wikiConfig: { type: 'jsonb' },
        wikiActiveRevision: { type: 'int', default: 1 },
        wikiStatus: { type: 'varchar', default: 'ready' },
        wikiModelId: { type: 'uuid', nullable: true },
        chatModelId: { type: 'uuid', nullable: true }
    },
    relations: {
        wikiModel: { type: 'many-to-one', target: 'WikiTestModel', joinColumn: { name: 'wikiModelId' } },
        chatModel: { type: 'many-to-one', target: 'WikiTestModel', joinColumn: { name: 'chatModelId' } }
    }
})
const pageSchema = new EntitySchema<KnowledgeWikiPage>({
    name: 'KnowledgeWikiPage',
    target: KnowledgeWikiPage,
    tableName: 'knowledge_wiki_page',
    columns: {
        id: idColumn,
        ...scopeColumns,
        pageKey: { type: 'varchar' },
        identityId: { type: 'uuid', nullable: true },
        pageType: { type: 'varchar', default: 'concept' },
        canonicalName: { type: 'varchar', default: '' },
        slug: { type: 'varchar', default: '' },
        activeVersionId: { type: 'uuid', nullable: true },
        status: { type: 'varchar', default: 'ready' },
        projectionStatus: { type: 'varchar', default: 'ready' },
        version: { type: 'int', default: 7 },
        sourceCount: { type: 'int', default: 1 },
        updatedAt: { type: 'timestamptz', default: () => 'now()' }
    }
})
const versionSchema = new EntitySchema<KnowledgeWikiPageVersion>({
    name: 'KnowledgeWikiPageVersion',
    target: KnowledgeWikiPageVersion,
    tableName: 'knowledge_wiki_page_version',
    columns: {
        id: idColumn,
        ...scopeColumns,
        pageId: { type: 'uuid' },
        title: { type: 'varchar' },
        summary: { type: 'text', default: '' },
        aliases: { type: 'jsonb', default: '[]' },
        contentMarkdown: { type: 'text', default: 'Body' },
        status: { type: 'varchar', default: 'ready' },
        projectionStatus: { type: 'varchar', default: 'ready' }
    }
})
const sourceSchema = new EntitySchema({
    name: 'WikiSourceTest',
    tableName: 'knowledge_wiki_source_state',
    columns: {
        id: idColumn,
        ...scopeColumns,
        sourceDocumentIdSnapshot: { type: 'uuid' },
        lastContentHash: { type: 'varchar', default: 'hash' },
        eligible: { type: 'boolean', default: true },
        cleanupPending: { type: 'boolean', default: false }
    }
})
const evidenceSchema = new EntitySchema({
    name: 'WikiEvidenceTest',
    tableName: 'knowledge_wiki_page_evidence',
    columns: {
        id: idColumn,
        ...scopeColumns,
        pageVersionId: { type: 'uuid' },
        sourceDocumentIdSnapshot: { type: 'uuid' },
        sourceContentHash: { type: 'varchar', default: 'hash' }
    }
})

function productionSchema(target: new () => object) {
    const metadata = getMetadataArgsStorage()
    const ancestors = new Set<object>()
    for (
        let constructor = target;
        constructor && constructor !== Function.prototype;
        constructor = Object.getPrototypeOf(constructor)
    )
        ancestors.add(constructor)
    const columns = Object.fromEntries(
        metadata.columns
            .filter((c) => typeof c.target === 'function' && ancestors.has(c.target))
            .map((c) => {
                const column: EntitySchemaColumnOptions = {
                    type: c.options.type ?? Reflect.getMetadata('design:type', target.prototype, c.propertyName),
                    name: c.options.name,
                    nullable: c.options.nullable,
                    primary: c.options.primary,
                    length: c.options.length,
                    default: c.options.default,
                    createDate: c.mode === 'createDate',
                    updateDate: c.mode === 'updateDate'
                }
                const generated = metadata.generations.find(
                    (g) =>
                        typeof g.target === 'function' && ancestors.has(g.target) && g.propertyName === c.propertyName
                )
                if (generated) column.generated = generated.strategy
                return [c.propertyName, column]
            })
    )
    const relations = Object.fromEntries(
        metadata.relations
            .filter((r) => typeof r.target === 'function' && ancestors.has(r.target))
            .map((r) => {
                const related = typeof r.type === 'function' ? Reflect.apply(r.type, undefined, []) : r.type
                const join = metadata.joinColumns.find(
                    (j) => j.target === r.target && j.propertyName === r.propertyName
                )
                const relation: EntitySchemaRelationOptions = {
                    ...r.options,
                    type: r.relationType,
                    target: typeof related === 'string' ? related : related.name,
                    joinColumn: { name: join?.name ?? `${r.propertyName}Id` }
                }
                return [r.propertyName, relation]
            })
    )
    const indices = metadata.indices
        .filter((i) => typeof i.target === 'function' && ancestors.has(i.target))
        .map((i) => {
            if (!Array.isArray(i.columns)) throw new Error('Test fixture requires explicit index columns')
            return { name: i.name, columns: i.columns, unique: i.unique }
        })
    return new EntitySchema({
        name: target.name,
        target,
        tableName: metadata.tables.find((t) => t.target === target).name,
        columns,
        relations,
        indices
    })
}

async function wikiOrganizationFixture(url: string) {
    const schema = `wiki_v15_${randomUUID().replace(/-/g, '')}`
    const db = new DataSource({
        type: 'postgres',
        url,
        schema,
        synchronize: false,
        extra: { options: `-c search_path=${schema},public` },
        entities: [
            kbSchema,
            pageSchema,
            versionSchema,
            sourceSchema,
            evidenceSchema,
            ...[
                KnowledgeWikiFolder,
                KnowledgeWikiPlacement,
                KnowledgeWikiTaxonomy,
                KnowledgeWikiJob,
                KnowledgeWikiModelInvocation,
                KnowledgeWikiPageLinkEntity
            ].map(productionSchema),
            ...['User', 'Tenant', 'Organization', 'WikiTestModel'].map(
                (name) => new EntitySchema({ name, columns: { id: idColumn } })
            )
        ]
    })
    await db.initialize()
    await db.query(`CREATE SCHEMA "${schema}"`)
    await db.synchronize()
    return {
        db,
        destroy: async () => {
            await db.query(`DROP SCHEMA "${schema}" CASCADE`)
            await db.destroy()
        }
    }
}
