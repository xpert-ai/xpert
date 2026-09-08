import { KBDocumentStatusEnum, KnowledgeWikiIdentityDescriptor } from '@xpert-ai/contracts'
import { DataSource, EntityManager, FindOptionsWhere, Repository } from 'typeorm'
import { KnowledgeDocument } from '../../knowledge-document/document.entity'
import { Knowledgebase } from '../knowledgebase.entity'
import { KnowledgeWikiJob, KnowledgeWikiPage, KnowledgeWikiSourceMapResult, KnowledgeWikiSourceState } from './entities'
import { KnowledgeWikiDedupModelInput, KnowledgeWikiDedupModelOutput } from './knowledge-wiki-dedup-model'
import { KnowledgeWikiIdentityResolverService } from './knowledge-wiki-identity-resolver.service'
import { KnowledgeWikiIdentityEmbeddingService } from './knowledge-wiki-identity-embedding.service'
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
        pageKey: `${descriptor.kind}:${id}`,
        canonicalName: name,
        pageType: descriptor.kind,
        identityRevision: 1,
        version: 1,
        identity: {
            descriptor,
            aliases: [name],
            embedding: { modelFingerprint: 'embedding', contentFingerprint: 'text', vector: [1, 0] }
        }
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
            sourceLifecycleGeneration: 1
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
                pages.find((page) => page.id === where.id) ?? null
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
            if (patch.identity) page.identity = patch.identity
            if (patch.identityRevision !== undefined) page.identityRevision = patch.identityRevision
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
    const embeddings = {
        prepare: jest.fn(
            async (_job: KnowledgeWikiJob, row: KnowledgeWikiSourceMapResult, choices: KnowledgeWikiPage[]) => {
                row.identityEmbedding = { modelFingerprint: 'embedding', contentFingerprint: 'text', vector: [1, 0] }
                choices.forEach((page) => {
                    page.identity.embedding = {
                        modelFingerprint: 'embedding',
                        contentFingerprint: 'text',
                        vector: [1, 0]
                    }
                })
            }
        )
    }
    const model = {
        invokeDedupModel: jest.fn(
            async (
                _job: KnowledgeWikiJob,
                _kb: Knowledgebase,
                input: KnowledgeWikiDedupModelInput
            ): Promise<KnowledgeWikiDedupModelOutput> => ({
                decision: 'same',
                pageId: input.candidates[0].id,
                reason: 'Source context identifies the same object.'
            })
        )
    }
    const scheduler = { schedulePages: jest.fn(async () => true) }
    const dispatcher = { dispatch: jest.fn() }
    const service = new KnowledgeWikiIdentityResolverService(
        jobs as unknown as Repository<KnowledgeWikiJob>,
        results as unknown as Repository<KnowledgeWikiSourceMapResult>,
        pageRepository as unknown as Repository<KnowledgeWikiPage>,
        dataSource as unknown as DataSource,
        fence as unknown as KnowledgeWikiJobFenceService,
        embeddings as unknown as KnowledgeWikiIdentityEmbeddingService,
        model as unknown as KnowledgeWikiModelInvocationService,
        scheduler as unknown as KnowledgeWikiPageSchedulerService,
        dispatcher as unknown as KnowledgeWikiJobDispatcherService
    )
    return { service, job, pipeline, rows, pages, pageRepository, jobs, model, scheduler, embeddings, documents }
}

describe('Wiki identity resolution stage', () => {
    it('resolves different names in a source to the same stable page and preserves both raw candidates', async () => {
        const h = harness([candidate('1', 'North Team', team), candidate('2', 'North Operations', team)])
        await h.service.process(h.job)
        expect(h.pages).toHaveLength(1)
        expect(h.rows[0].normalizedPageKey).toBe(h.rows[1].normalizedPageKey)
        expect(h.rows).toHaveLength(2)
        expect(h.rows[1].identityDecision.outcome).toBe('same')
        expect(h.pages[0].identity.aliases).toEqual(['North Team', 'North Operations'])
        expect(h.scheduler.schedulePages).toHaveBeenCalledWith(h.pipeline, h.job)
    })

    it('uses per-document Summary identity without an embedding or semantic model call', async () => {
        const h = harness([
            candidate('1', 'Report', { kind: 'summary' }),
            candidate('2', 'Renamed report', { kind: 'summary' }),
            candidate('3', 'Report', { kind: 'summary' }, 'another')
        ])
        await h.service.process(h.job)
        expect(h.pages).toHaveLength(2)
        expect(h.rows.map((row) => row.normalizedPageKey)).toEqual(['summary:doc', 'summary:doc', 'summary:another'])
        expect(h.model.invokeDedupModel).not.toHaveBeenCalled()
        expect(h.embeddings.prepare).not.toHaveBeenCalled()
    })

    it('preserves same-name entities with conflicting identifiers as separate pages', async () => {
        const first = { ...team, identifiers: [{ namespace: 'company/team', value: 'north' }] }
        const second = { ...team, identifiers: [{ namespace: 'company/team', value: 'south' }] }
        const h = harness([candidate('1', 'Operations', first), candidate('2', 'Operations', second)])
        await h.service.process(h.job)
        expect(h.pages).toHaveLength(2)
        expect(h.rows[0].normalizedPageKey).not.toBe(h.rows[1].normalizedPageKey)
        expect(h.model.invokeDedupModel).not.toHaveBeenCalled()
    })

    it.each(['different', 'uncertain'] as const)(
        'does not merge related concepts when the semantic judge returns %s',
        async (decision) => {
            const h = harness(
                [
                    candidate('new', 'Keyword retrieval', {
                        ...retrieval,
                        definition: 'Retrieve passages by exact words.'
                    })
                ],
                [existingPage('semantic', 'Semantic retrieval', retrieval)]
            )
            h.model.invokeDedupModel.mockResolvedValue({
                decision,
                pageId: null,
                reason: 'Definitions do not establish equivalence.'
            })
            await h.service.process(h.job)
            expect(h.pages).toHaveLength(2)
            expect(h.rows[0].identityDecision.outcome).toBe(decision === 'different' ? 'new' : 'uncertain')
        }
    )

    it('merges equivalent concepts across names, preserving their explicit definition in the model input', async () => {
        const h = harness(
            [candidate('new', 'Semantic search', retrieval)],
            [existingPage('semantic', 'Semantic retrieval', retrieval)]
        )
        await h.service.process(h.job)
        expect(h.pages).toHaveLength(1)
        expect(h.rows[0].normalizedPageKey).toBe('concept:semantic')
        expect(h.model.invokeDedupModel.mock.calls[0][2].descriptor).toEqual(retrieval)
    })

    it('rejects a provider failure without converting it to a new identity', async () => {
        const h = harness([candidate('new', 'Northern Team', team)], [existingPage('north', 'North Team', team)])
        h.model.invokeDedupModel.mockRejectedValue(new Error('Provider outcome uncertain'))
        await expect(h.service.process(h.job)).rejects.toThrow('Provider outcome uncertain')
        expect(h.pages).toHaveLength(1)
        expect(h.rows[0].normalizedPageKey).toBeNull()
        expect(h.scheduler.schedulePages).not.toHaveBeenCalled()
    })

    it('rejects a page id outside the supplied, scoped candidate set', async () => {
        const h = harness([candidate('new', 'Northern Team', team)], [existingPage('north', 'North Team', team)])
        h.model.invokeDedupModel.mockResolvedValue({
            decision: 'same',
            pageId: 'foreign-kb-page',
            reason: 'Untrusted model output.'
        })
        await expect(h.service.process(h.job)).rejects.toMatchObject({ code: 'knowledge_wiki_identity_invalid' })
        expect(h.rows[0].normalizedPageKey).toBeNull()
    })

    it('reuses persisted identity decisions when resuming after downstream interruption', async () => {
        const h = harness([candidate('1', 'North Operations', team)], [existingPage('north', 'North Team', team)])
        h.scheduler.schedulePages.mockRejectedValueOnce(new Error('Scheduling interrupted'))
        await expect(h.service.process(h.job)).rejects.toThrow('Scheduling interrupted')
        await h.service.process(h.job)
        expect(h.model.invokeDedupModel).toHaveBeenCalledTimes(1)
        expect(h.pages).toHaveLength(1)
        expect(h.scheduler.schedulePages).toHaveBeenCalledTimes(2)
    })

    it('rechecks the catalogue after a concurrent identity allocation instead of creating a duplicate', async () => {
        const h = harness([candidate('new', 'Northern Team', team)])
        h.embeddings.prepare.mockImplementationOnce(async (_job, row) => {
            row.identityEmbedding = { modelFingerprint: 'embedding', contentFingerprint: 'text', vector: [1, 0] }
            h.pages.push(existingPage('other-worker', 'North Team', team))
        })
        await h.service.process(h.job)
        expect(h.pages).toHaveLength(1)
        expect(h.rows[0].normalizedPageKey).toBe('entity:other-worker')
        expect(h.model.invokeDedupModel).toHaveBeenCalledTimes(1)
    })

    it('rejects a source changed during the model call before committing its identity', async () => {
        const h = harness([candidate('new', 'Northern Team', team)], [existingPage('north', 'North Team', team)])
        h.model.invokeDedupModel.mockImplementationOnce(async () => {
            h.documents[0].publicationEpoch += 1
            return { decision: 'same', pageId: 'north', reason: 'Same team.' }
        })
        await expect(h.service.process(h.job)).rejects.toMatchObject({ code: 'knowledge_wiki_identity_stale' })
        expect(h.rows[0].normalizedPageKey).toBeNull()
        expect(h.scheduler.schedulePages).not.toHaveBeenCalled()
    })
})
