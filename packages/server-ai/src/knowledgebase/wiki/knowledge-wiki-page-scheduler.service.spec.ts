import { DataSource, EntityManager, FindOptionsWhere } from 'typeorm'
import {
    KnowledgeWikiJob,
    KnowledgeWikiPage,
    KnowledgeWikiPageContribution,
    KnowledgeWikiSourceMapResult
} from './entities'
import { KnowledgeWikiJobDispatcherService } from './knowledge-wiki-job-dispatcher.service'
import { KnowledgeWikiPageSchedulerService } from './knowledge-wiki-page-scheduler.service'

function fixture() {
    const map = Object.assign(new KnowledgeWikiJob(), {
        id: 'map',
        type: 'source_map',
        status: 'running',
        isCurrent: true,
        knowledgebaseId: 'kb',
        jobKey: 'source:doc',
        executionAttempt: 1,
        generationAttempt: 0,
        sourceDocumentIdSnapshot: 'doc',
        billingPrincipalId: 'user',
        tenantId: 'tenant'
    })
    const jobs: KnowledgeWikiJob[] = [map]
    const rows: KnowledgeWikiSourceMapResult[] = []
    const pages: KnowledgeWikiPage[] = []
    const contributions: KnowledgeWikiPageContribution[] = []
    const repository = {
        findOne: async ({ where }: { where: FindOptionsWhere<KnowledgeWikiJob> }) =>
            jobs.find((job) => (where.id ? job.id === where.id : job.jobKey === where.jobKey)) ?? null,
        find: async () => jobs.filter((job) => job.type === 'source_map' && job.status === 'succeeded'),
        count: async () => jobs.filter((job) => job.type === 'source_map' && job.status !== 'succeeded').length,
        create: (input: Partial<KnowledgeWikiJob>) =>
            Object.assign(new KnowledgeWikiJob(), { id: `job-${jobs.length}` }, input),
        save: async (job: KnowledgeWikiJob) => {
            jobs.push(job)
            return job
        },
        update: async (where: FindOptionsWhere<KnowledgeWikiJob>, patch: Partial<KnowledgeWikiJob>) => {
            const job = jobs.find((item) => item.id === where.id && (!where.status || item.status === where.status))
            if (!job) return { affected: 0 }
            Object.assign(job, patch)
            return { affected: 1 }
        }
    }
    const manager = {
        getRepository: (entity: object) => {
            if (entity === KnowledgeWikiJob) return repository
            if (entity === KnowledgeWikiSourceMapResult) return { find: async () => rows }
            if (entity === KnowledgeWikiPage) return { find: async () => pages }
            if (entity === KnowledgeWikiPageContribution) return { find: async () => contributions }
            throw new Error('Unexpected scheduler fixture repository')
        }
    } as unknown as EntityManager
    let tail = Promise.resolve()
    const dataSource = {
        transaction: <T>(work: (manager: EntityManager) => Promise<T>) => {
            const result = tail.then(() => work(manager))
            tail = result.then(
                () => undefined,
                () => undefined
            )
            return result
        }
    }
    const dispatcher = { dispatch: jest.fn(async () => undefined) }
    const service = new KnowledgeWikiPageSchedulerService(
        dataSource as unknown as DataSource,
        dispatcher as unknown as KnowledgeWikiJobDispatcherService
    )
    return { service, dispatcher, map, jobs, rows, pages, contributions }
}

describe('Wiki Map -> identity -> Reduce scheduling', () => {
    it('completes source extraction with a durable identity job before any Reduce is queued', async () => {
        const h = fixture()
        await h.service.completeMap(h.map, null)
        expect(h.map.status).toBe('succeeded')
        expect(h.jobs.map((job) => job.type)).toEqual(['source_map', 'identity_resolve'])
        expect(h.jobs[1]).toMatchObject({
            parentJobId: h.map.id,
            sourceDocumentIdSnapshot: 'doc',
            dispatchAttempts: 0,
            dispatchAfter: expect.any(Date)
        })
        await h.service.scheduleIdentity(h.map)
        expect(h.jobs.filter((job) => job.type === 'identity_resolve')).toHaveLength(1)
    })

    it('waits for every source Map in a rebuild before scheduling one batch identity job', async () => {
        const h = fixture()
        const root = Object.assign(new KnowledgeWikiJob(), {
            id: 'root',
            type: 'rebuild',
            jobKey: 'rebuild:1',
            knowledgebaseId: 'kb',
            status: 'succeeded',
            isCurrent: true
        })
        const second = Object.assign(new KnowledgeWikiJob(), h.map, {
            id: 'map-2',
            jobKey: 'source:doc-2',
            sourceDocumentIdSnapshot: 'doc-2'
        })
        h.jobs.push(root, second)
        await h.service.completeMap(h.map, root)
        expect(h.jobs.some((job) => job.type === 'identity_resolve')).toBe(false)
        await h.service.completeMap(second, root)
        expect(h.jobs.filter((job) => job.type === 'identity_resolve')).toEqual([
            expect.objectContaining({ parentJobId: 'root', rootJobId: 'root' })
        ])
    })

    it('groups by resolved identity and schedules prior affected pages to retract replaced source material', async () => {
        const h = fixture()
        await h.service.completeMap(h.map, null)
        const resolver = h.jobs.find((job) => job.type === 'identity_resolve')
        resolver.status = 'running'
        resolver.executionAttempt = 1
        h.rows.push(
            ...['first-name', 'alias'].map((candidateKey) =>
                Object.assign(new KnowledgeWikiSourceMapResult(), { candidateKey, normalizedPageKey: 'entity:stable' })
            )
        )
        h.contributions.push(Object.assign(new KnowledgeWikiPageContribution(), { pageId: 'old-page' }))
        h.pages.push(Object.assign(new KnowledgeWikiPage(), { id: 'old-page', pageKey: 'entity:old' }))
        expect(await h.service.schedulePages(h.map, resolver)).toBe(true)
        expect(h.jobs.filter((job) => job.type === 'page_reduce').map((job) => job.pageKey)).toEqual([
            'entity:old',
            'entity:stable'
        ])
        expect(h.jobs.filter((job) => job.type === 'finalize')).toHaveLength(1)
        expect(h.jobs.filter((job) => job.type === 'page_reduce').every((job) => job.parentJobId === h.map.id)).toBe(
            true
        )
        expect(resolver.status).toBe('succeeded')
    })

    it('does not queue page generation while a raw candidate still has no identity', async () => {
        const h = fixture()
        await h.service.completeMap(h.map, null)
        const resolver = h.jobs[1]
        resolver.status = 'running'
        h.rows.push(Object.assign(new KnowledgeWikiSourceMapResult(), { normalizedPageKey: null }))
        expect(await h.service.schedulePages(h.map, resolver)).toBe(false)
        expect(h.jobs.some((job) => job.type === 'page_reduce' || job.type === 'finalize')).toBe(false)
    })
})
