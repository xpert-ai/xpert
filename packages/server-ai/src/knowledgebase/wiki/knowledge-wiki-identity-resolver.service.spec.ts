import { KBDocumentStatusEnum, KnowledgeWikiIdentityDescriptor } from '@xpert-ai/contracts'
import { DataSource, EntityManager, FindOptionsWhere, Repository } from 'typeorm'
import { KnowledgeDocument } from '../../knowledge-document/document.entity'
import { Knowledgebase } from '../knowledgebase.entity'
import { KnowledgeWikiJob, KnowledgeWikiPage, KnowledgeWikiSourceMapResult, KnowledgeWikiSourceState } from './entities'
import { KnowledgeWikiIdentityResolverService } from './knowledge-wiki-identity-resolver.service'
import { KnowledgeIdentityService } from '../identity/knowledge-identity.service'
import { KnowledgeIdentityInput, KnowledgeIdentityRuntime } from '../identity/knowledge-identity.types'
import { KnowledgeIdentityObservation } from '../identity/knowledge-identity-observation.entity'
import { KnowledgeIdentityError } from '../identity/knowledge-identity-error'
import { KnowledgeWikiJobDispatcherService } from './knowledge-wiki-job-dispatcher.service'
import { KnowledgeWikiJobFenceService } from './knowledge-wiki-job-fence.service'
import { KnowledgeWikiModelInvocationService } from './knowledge-wiki-model-invocation.service'
import { KnowledgeWikiPageSchedulerService } from './knowledge-wiki-page-scheduler.service'

const team: KnowledgeWikiIdentityDescriptor = {
    kind: 'entity',
    entityType: 'organization',
    description: 'The north division operations team.',
    scope: 'north division',
    identifiers: []
}
const retrieval: KnowledgeWikiIdentityDescriptor = {
    kind: 'concept',
    definition: 'Retrieve passages by semantic meaning.',
    domain: 'information retrieval',
    scope: null
}

function candidate(id: string, name: string, identity: KnowledgeWikiIdentityDescriptor, documentId = 'doc') {
    return Object.assign(new KnowledgeWikiSourceMapResult(), {
        id,
        candidateKey: id,
        sourceJobId: `map-${documentId}`,
        knowledgebaseId: 'kb',
        sourceDocumentIdSnapshot: documentId,
        sourceContentHash: 'hash',
        sourceLifecycleGeneration: 1,
        pageType: identity.kind,
        canonicalName: name,
        normalizedPageKey: null,
        identity,
        payload: {
            schemaVersion: 1,
            pageType: identity.kind,
            canonicalName: name,
            aliases: [],
            summary: name,
            facts: [{ text: `${name} is documented.`, sourceChunkIds: ['chunk'] }],
            suggestedLinks: []
        }
    })
}

function existingPage(id: string, name: string, descriptor: KnowledgeWikiIdentityDescriptor) {
    return Object.assign(new KnowledgeWikiPage(), {
        id,
        knowledgebaseId: 'kb',
        identityId: 'shared-identity',
        pageKey: `${descriptor.kind}:${id}`,
        canonicalName: name,
        pageType: descriptor.kind,
        version: 4,
        activeVersionId: 'published-version'
    })
}

function harness(rows: KnowledgeWikiSourceMapResult[], initialPages: KnowledgeWikiPage[] = []) {
    const pages = [...initialPages]
    const kb = Object.assign(new Knowledgebase(), { id: 'kb', tenantId: 'tenant', organizationId: 'org' })
    const maps = [...new Set(rows.map((row) => row.sourceDocumentIdSnapshot))].map((id) =>
        Object.assign(new KnowledgeWikiJob(), {
            id: `map-${id}`,
            type: 'source_map',
            knowledgebaseId: 'kb',
            status: 'succeeded',
            sourceDocumentIdSnapshot: id,
            sourceContentHash: 'hash',
            sourcePublicationEpoch: 1,
            sourceLifecycleGeneration: 1,
            generationAttempt: 0
        })
    )
    const pipeline =
        maps.length === 1
            ? maps[0]
            : Object.assign(new KnowledgeWikiJob(), {
                  id: 'rebuild',
                  type: 'rebuild',
                  knowledgebaseId: 'kb',
                  status: 'succeeded',
                  expectedChildren: maps.length
              })
    const job = Object.assign(new KnowledgeWikiJob(), {
        id: 'dedup',
        parentJobId: pipeline.id,
        knowledgebaseId: 'kb',
        type: 'identity_resolve',
        status: 'running',
        executionAttempt: 1,
        generationAttempt: 0,
        isCurrent: true
    })
    const documents = maps.map((map) =>
        Object.assign(new KnowledgeDocument(), {
            id: map.sourceDocumentIdSnapshot,
            knowledgebaseId: 'kb',
            contentHash: 'hash',
            status: KBDocumentStatusEnum.FINISH,
            publicationEpoch: 1
        })
    )
    const states = maps.map((map) =>
        Object.assign(new KnowledgeWikiSourceState(), {
            sourceDocumentIdSnapshot: map.sourceDocumentIdSnapshot,
            eligible: true,
            lifecycleGeneration: 1,
            desiredRootJobId: map.id
        })
    )
    const jobs = {
        findOne: jest.fn(async ({ where }: { where: FindOptionsWhere<KnowledgeWikiJob> }) =>
            where.id === job.id ? job : where.id === pipeline.id ? pipeline : null
        ),
        find: jest.fn(async () => maps),
        update: jest.fn(async (_where: unknown, patch: Partial<KnowledgeWikiJob>) => {
            Object.assign(job, patch)
            return { affected: 1 }
        })
    }
    const pageRepository = {
        findOne: jest.fn(
            async ({ where }: { where: FindOptionsWhere<KnowledgeWikiPage> }) =>
                pages.find((page) =>
                    where.identityId ? page.identityId === where.identityId : page.pageKey === where.pageKey
                ) ?? null
        ),
        find: jest.fn(async ({ where }: { where: FindOptionsWhere<KnowledgeWikiPage> }) =>
            pages
                .filter((page) => !where.pageType || page.pageType === where.pageType)
                .map((page) => Object.assign(new KnowledgeWikiPage(), structuredClone(page)))
        ),
        create: (value: Partial<KnowledgeWikiPage>) => Object.assign(new KnowledgeWikiPage(), value),
        save: jest.fn(async (page: KnowledgeWikiPage) => {
            pages.push(page)
            return page
        }),
        update: jest.fn(async (id: string, patch: Partial<KnowledgeWikiPage>) => {
            const page = pages.find((item) => item.id === id)
            if (!page) return { affected: 0 }
            Object.assign(page, patch)
            return { affected: 1 }
        })
    }
    const results = {
        find: jest.fn(async () => rows),
        findOne: jest.fn(async ({ where }: { where: FindOptionsWhere<KnowledgeWikiSourceMapResult> }) =>
            rows.find((row) => row.id === where.id)
        ),
        update: jest.fn(async (id: string, patch: Partial<KnowledgeWikiSourceMapResult>) => {
            Object.assign(
                rows.find((row) => row.id === id),
                patch
            )
            return { affected: 1 }
        })
    }
    const manager = {
        getRepository: (entity: object) => {
            if (entity === KnowledgeWikiPage) return pageRepository
            if (entity === KnowledgeWikiJob) return jobs
            if (entity === KnowledgeWikiSourceMapResult) return results
            if (entity === Knowledgebase) return { findOne: async () => kb }
            if (entity === KnowledgeDocument)
                return {
                    findOne: async ({ where }: { where: { id: string } }) =>
                        documents.find((doc) => doc.id === where.id)
                }
            if (entity === KnowledgeWikiSourceState)
                return {
                    findOne: async ({ where }: { where: { sourceDocumentIdSnapshot: string } }) =>
                        states.find((state) => state.sourceDocumentIdSnapshot === where.sourceDocumentIdSnapshot)
                }
            throw new Error('Unexpected fixture repository')
        }
    } as unknown as EntityManager
    let tail = Promise.resolve()
    const dataSource = {
        manager,
        transaction: <T>(run: (manager: EntityManager) => Promise<T>) => {
            const work = tail.then(() => run(manager))
            tail = work.then(
                () => undefined,
                () => undefined
            )
            return work
        }
    }
    const fence = {
        assert: jest.fn(async () => kb),
        isSourceCurrent: (map: KnowledgeWikiJob, doc: KnowledgeDocument) =>
            map.sourceContentHash === doc.contentHash && map.sourcePublicationEpoch === doc.publicationEpoch
    }
    const model = { invokeDedupModel: jest.fn() }
    const identities = {
        resolveBatch: jest.fn(
            async (_source: unknown, inputs: KnowledgeIdentityInput[], runtime: KnowledgeIdentityRuntime) => {
                await runtime.assertCurrent(manager)
                return inputs.map((input) =>
                    Object.assign(new KnowledgeIdentityObservation(), {
                        candidateKey: input.candidateKey,
                        identityId: 'shared-identity',
                        decision: { outcome: 'same', reason: 'Same object.', comparedIdentityIds: [] }
                    })
                )
            }
        )
    }
    const scheduler = { schedulePages: jest.fn(async () => true) }
    const dispatcher = { dispatch: jest.fn() }
    const service = new KnowledgeWikiIdentityResolverService(
        jobs as unknown as Repository<KnowledgeWikiJob>,
        results as unknown as Repository<KnowledgeWikiSourceMapResult>,
        dataSource as unknown as DataSource,
        fence as unknown as KnowledgeWikiJobFenceService,
        identities as unknown as KnowledgeIdentityService,
        model as unknown as KnowledgeWikiModelInvocationService,
        scheduler as unknown as KnowledgeWikiPageSchedulerService,
        dispatcher as unknown as KnowledgeWikiJobDispatcherService
    )
    return {
        service,
        job,
        pipeline,
        rows,
        pages,
        pageRepository,
        jobs,
        model,
        scheduler,
        identities,
        documents,
        dispatcher
    }
}

describe('Wiki adapter for shared knowledge identity', () => {
    it('attaches aliases resolved by the shared service to one page and preserves both source candidates', async () => {
        const h = harness([candidate('1', 'North Team', team), candidate('2', 'North Operations', team)])
        await h.service.process(h.job)
        expect(h.pages).toHaveLength(1)
        expect(h.rows[0].normalizedPageKey).toBe(h.rows[1].normalizedPageKey)
        expect(h.rows.map((row) => row.identityId)).toEqual(['shared-identity', 'shared-identity'])
        expect(h.identities.resolveBatch).toHaveBeenCalledWith(
            expect.objectContaining({ consumer: 'wiki', sourcePublicationEpoch: 1 }),
            expect.arrayContaining([expect.objectContaining({ descriptor: team })]),
            expect.any(Object)
        )
        expect(h.scheduler.schedulePages).toHaveBeenCalledWith(h.pipeline, h.job)
    })

    it('keeps Summary document-owned without submitting summaries for identity matching', async () => {
        const h = harness([
            candidate('1', 'Report', { kind: 'summary' }),
            candidate('2', 'Renamed report', { kind: 'summary' }),
            candidate('3', 'Report', { kind: 'summary' }, 'another')
        ])
        await h.service.process(h.job)
        expect(h.pages).toHaveLength(2)
        expect(h.rows.map((row) => row.normalizedPageKey)).toEqual(['summary:doc', 'summary:doc', 'summary:another'])
        expect(h.identities.resolveBatch.mock.calls.map((call) => call[1])).toEqual([[], []])
        expect(h.model.invokeDedupModel).not.toHaveBeenCalled()
    })

    it('leaves the published article and page id intact when binding a new source to its identity', async () => {
        const page = existingPage('published', 'Semantic retrieval', retrieval)
        const h = harness([candidate('new', 'Semantic search', retrieval)], [page])
        await h.service.process(h.job)
        expect(h.pages).toHaveLength(1)
        expect(h.rows[0].normalizedPageKey).toBe('concept:published')
        expect(page).toMatchObject({ id: 'published', version: 4, activeVersionId: 'published-version' })
        expect(h.pageRepository.update).not.toHaveBeenCalled()
    })

    it('does not allocate a page or schedule Reduce when shared identity fails', async () => {
        const h = harness([candidate('new', 'Northern Team', team)])
        h.identities.resolveBatch.mockRejectedValue(new Error('Provider outcome uncertain'))
        await expect(h.service.process(h.job)).rejects.toThrow('Provider outcome uncertain')
        expect(h.pages).toHaveLength(0)
        expect(h.rows[0].normalizedPageKey).toBeNull()
        expect(h.scheduler.schedulePages).not.toHaveBeenCalled()
    })

    it('resumes after downstream interruption without repeating identity resolution', async () => {
        const h = harness([candidate('1', 'North Operations', team)])
        h.scheduler.schedulePages.mockRejectedValueOnce(new Error('Scheduling interrupted'))
        await expect(h.service.process(h.job)).rejects.toThrow('Scheduling interrupted')
        await h.service.process(h.job)
        expect(h.identities.resolveBatch).toHaveBeenCalledTimes(1)
        expect(h.pages).toHaveLength(1)
        expect(h.scheduler.schedulePages).toHaveBeenCalledTimes(2)
    })

    it('retains the source-generation fence and does not attach stale candidates', async () => {
        const h = harness([candidate('new', 'Northern Team', team)])
        const original = h.identities.resolveBatch.getMockImplementation()
        h.identities.resolveBatch.mockImplementationOnce(async (source, input, runtime) => {
            h.documents[0].publicationEpoch += 1
            return original(source, input, runtime)
        })
        await expect(h.service.process(h.job)).rejects.toMatchObject({ code: 'knowledge_wiki_identity_stale' })
        expect(h.pages).toHaveLength(0)
    })

    it('requeues catalogue contention without converting it into a new page', async () => {
        const h = harness([candidate('new', 'Northern Team', team)])
        h.identities.resolveBatch.mockRejectedValue(new KnowledgeIdentityError('busy'))
        await h.service.process(h.job)
        expect(h.jobs.update).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ status: 'queued' }))
        expect(h.dispatcher.dispatch).toHaveBeenCalled()
        expect(h.pages).toHaveLength(0)
    })
})
