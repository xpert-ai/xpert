import { KnowledgeWikiFinalizeService } from './knowledge-wiki-finalize.service'
import { KnowledgeWikiJob, KnowledgeWikiPage, KnowledgeWikiPageVersion } from './entities'
import { Knowledgebase } from '../knowledgebase.entity'

function fixture() {
    const page = Object.assign(new KnowledgeWikiPage(), {
        id: 'page',
        knowledgebaseId: 'kb',
        pageKey: 'entity:team',
        pageType: 'entity',
        activeVersionId: 'old-version',
        status: 'ready',
        projectionStatus: 'ready',
        version: 5
    })
    const version = Object.assign(new KnowledgeWikiPageVersion(), {
        id: 'new-version',
        pageId: page.id,
        producerJobId: 'reduce',
        generationAttempt: 0,
        expectedPageVersion: 4,
        projectionStatus: 'ready',
        status: 'building'
    })
    const child = Object.assign(new KnowledgeWikiJob(), {
        id: 'reduce',
        knowledgebaseId: 'kb',
        parentJobId: 'map',
        type: 'page_reduce',
        pageKey: page.pageKey,
        status: 'succeeded',
        isCurrent: true,
        generationAttempt: 0,
        executionAttempt: 1,
        dispatchAttempts: 1
    })
    const job = Object.assign(new KnowledgeWikiJob(), {
        id: 'finalize',
        knowledgebaseId: 'kb',
        parentJobId: 'map',
        type: 'finalize',
        billingPrincipalId: 'user',
        status: 'running',
        isCurrent: true,
        generationAttempt: 0,
        executionAttempt: 1,
        dispatchAttempts: 1
    })
    const jobs = {
        find: jest.fn(async () => [child]),
        findOne: jest.fn(
            async ({ where }: { where: { id: string } }): Promise<KnowledgeWikiJob | null> =>
                where.id === job.id ? job : where.id === child.id ? child : null
        ),
        update: jest.fn(async (where: string | { id: string }, patch: Partial<KnowledgeWikiJob>) => {
            const id = typeof where === 'string' ? where : where.id
            Object.assign(id === job.id ? job : child, patch)
            return { affected: 1 }
        })
    }
    const pages = { findOne: jest.fn(async () => page), update: jest.fn(async () => ({ affected: 0 })) }
    const versions = { findOne: jest.fn(async () => version), update: jest.fn(), count: async () => 1 }
    const knowledgebase = Object.assign(new Knowledgebase(), { id: 'kb', wikiActiveRevision: 1 })
    const knowledgebases = { findOneOrFail: async () => knowledgebase, update: jest.fn() }
    const dispatcher = { dispatch: jest.fn(), markSucceeded: jest.fn() }
    const projection = { stage: jest.fn(), retireSupersededVersions: jest.fn() }
    const service = Object.assign(Object.create(KnowledgeWikiFinalizeService.prototype), {
        jobRepository: jobs,
        pageRepository: pages,
        pageVersionRepository: versions,
        jobFence: { assert: async () => knowledgebase },
        dispatcher,
        indexService: {
            prepare: async (_kb: Knowledgebase, _job: KnowledgeWikiJob, candidates: unknown[]) => candidates
        },
        linkService: { stageGeneratedLinks: jest.fn(), refreshCounts: jest.fn() },
        projectionService: projection,
        dataSource: {
            transaction: async (work: (manager: object) => Promise<void>) =>
                work({
                    getRepository: (entity: object) =>
                        entity === Knowledgebase
                            ? knowledgebases
                            : entity === KnowledgeWikiJob
                              ? jobs
                              : entity === KnowledgeWikiPage
                                ? pages
                                : versions
                })
        }
    }) as KnowledgeWikiFinalizeService
    return { service, page, version, child, job, dispatcher, projection, pages, knowledgebase }
}

describe('Wiki publication conflict recovery', () => {
    it('retires superseded projections only after the replacement transaction commits', async () => {
        const { service, page, version, job, pages, projection, dispatcher } = fixture()
        version.expectedPageVersion = page.version
        pages.update.mockImplementation(async () => {
            expect(projection.retireSupersededVersions).not.toHaveBeenCalled()
            page.activeVersionId = version.id
            return { affected: 1 }
        })
        projection.retireSupersededVersions.mockImplementation(async () => {
            expect(page.activeVersionId).toBe(version.id)
        })
        await service.process(job)
        expect(projection.retireSupersededVersions).toHaveBeenCalledWith('kb')
        expect(dispatcher.markSucceeded).toHaveBeenCalledWith(job.id)
    })

    it('retries cleanup when the page pointer was already published by an earlier attempt', async () => {
        const { service, page, version, job, projection } = fixture()
        page.activeVersionId = version.id
        await service.process(job)
        expect(projection.stage).not.toHaveBeenCalled()
        expect(projection.retireSupersededVersions).toHaveBeenCalledWith('kb')
    })

    it('keeps the published version and schedules the conflicted page against current sources', async () => {
        const { service, page, child, job, dispatcher, projection } = fixture()
        await service.process(job)
        expect(page.activeVersionId).toBe('old-version')
        expect(child.status).toBe('queued')
        expect(job.status).toBe('queued')
        expect(job.generationAttempt).toBe(1)
        expect(projection.stage).not.toHaveBeenCalled()
        expect(projection.retireSupersededVersions).not.toHaveBeenCalled()
        expect(dispatcher.dispatch).toHaveBeenCalledWith(expect.objectContaining({ id: 'reduce' }), 'user')
    })

    it('recovers a conflict that happens after vector staging without publishing a partial batch', async () => {
        const { service, page, version, child, job, projection, dispatcher } = fixture()
        version.expectedPageVersion = page.version
        await service.process(job)
        expect(projection.stage).toHaveBeenCalledTimes(1)
        expect(page.activeVersionId).toBe('old-version')
        expect(child.status).toBe('queued')
        expect(dispatcher.markSucceeded).not.toHaveBeenCalled()
        expect(projection.retireSupersededVersions).not.toHaveBeenCalled()
    })

    it('bounds automatic conflict retries and retains the published page', async () => {
        const { service, page, job, dispatcher } = fixture()
        job.generationAttempt = 3
        await expect(service.process(job)).rejects.toThrow()
        expect(page.activeVersionId).toBe('old-version')
        expect(dispatcher.dispatch).not.toHaveBeenCalled()
    })
})
