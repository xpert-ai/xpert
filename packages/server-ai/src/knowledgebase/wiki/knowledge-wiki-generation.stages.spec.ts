import { Logger } from '@nestjs/common'
import { AiModelTypeEnum, KBDocumentStatusEnum, KnowledgebaseTypeEnum } from '@xpert-ai/contracts'
import { Queue } from 'bull'
import i18next from 'i18next'
import { DataSource, EntityManager, Repository } from 'typeorm'
import { KnowledgeDocument } from '../../knowledge-document/document.entity'
import { Knowledgebase } from '../knowledgebase.entity'
import {
    KnowledgeWikiJob,
    KnowledgeWikiModelInvocation,
    KnowledgeWikiPage,
    KnowledgeWikiPageContribution,
    KnowledgeWikiPageLinkEntity,
    KnowledgeWikiPageVersion
} from './entities'
import {
    createKnowledgeWikiConfigFingerprint,
    KNOWLEDGE_WIKI_GENERATOR_VERSION,
    resolveKnowledgeWikiModel
} from './knowledge-wiki-config'
import { KnowledgeWikiGenerationService } from './knowledge-wiki-generation.service'
import { KnowledgeWikiFinalizeService } from './knowledge-wiki-finalize.service'
import { KnowledgeWikiPageReduceService } from './knowledge-wiki-page-reduce.service'
import { KnowledgeWikiIndexService } from './knowledge-wiki-index.service'
import { KnowledgeWikiJobDispatcherService } from './knowledge-wiki-job-dispatcher.service'
import { KnowledgeWikiJobFenceService } from './knowledge-wiki-job-fence.service'
import { KnowledgeWikiJobLeaseService } from './knowledge-wiki-job-lease.service'
import { KnowledgeWikiLinkService } from './knowledge-wiki-link.service'
import { KnowledgeWikiInvocationBudgetService } from './knowledge-wiki-invocation-budget.service'
import { KnowledgeWikiModelInvocationService } from './knowledge-wiki-model-invocation.service'
import { KnowledgeWikiGenerationQueueJob } from './types'

// Exercise the public worker entry point with real Wiki collaborators; only persistence and Bull are fakes.
function createHarness(type: KnowledgeWikiJob['type'], children: Partial<KnowledgeWikiJob>[] = []) {
    const knowledgebase = Object.assign(new Knowledgebase(), {
        id: 'kb-1',
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        type: KnowledgebaseTypeEnum.Standard,
        wikiConfig: { enabled: true, extractionGranularity: 'standard' },
        wikiStatus: 'indexing',
        wikiActiveRevision: 1,
        wikiStagedRevision: 2,
        wikiRevision: 2,
        chatModel: { id: 'model-1', copilotId: 'copilot-1', model: 'llm', modelType: AiModelTypeEnum.LLM }
    })
    knowledgebase.wikiConfigFingerprint = createKnowledgeWikiConfigFingerprint(
        knowledgebase.wikiConfig,
        resolveKnowledgeWikiModel(knowledgebase)
    )
    const job = Object.assign(new KnowledgeWikiJob(), {
        id: 'job-1',
        knowledgebaseId: 'kb-1',
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        rootJobId: 'root-1',
        parentJobId: 'map-1',
        sourceDocumentIdSnapshot: 'doc-1',
        sourceLifecycleGeneration: 2,
        type,
        status: 'queued',
        isCurrent: true,
        executionAttempt: 0,
        generationAttempt: 0,
        dispatchAttempts: 0,
        generationRevision: 2,
        configFingerprint: knowledgebase.wikiConfigFingerprint,
        generatorVersion: KNOWLEDGE_WIKI_GENERATOR_VERSION,
        billingPrincipalId: 'user-1'
    })
    const jobRepository = {
        query: jest.fn().mockResolvedValue([]),
        findOne: jest.fn(
            async ({ where }: { where: Partial<KnowledgeWikiJob> }): Promise<KnowledgeWikiJob | null> =>
                where.id === job.id ? Object.assign(new KnowledgeWikiJob(), job) : null
        ),
        find: jest.fn(async () => children.map((child) => Object.assign(new KnowledgeWikiJob(), child))),
        update: jest.fn(async (_where: unknown, patch: Partial<KnowledgeWikiJob>) => {
            Object.assign(job, patch)
            return { affected: 1 }
        })
    }
    const knowledgebaseRepository = {
        findOneOrFail: jest.fn(async () => knowledgebase),
        findOne: jest.fn(async () => knowledgebase),
        update: jest.fn(async (_where: unknown, patch: Partial<Knowledgebase>) => {
            Object.assign(knowledgebase, patch)
            return { affected: 1 }
        })
    }
    const pageRepository = {
        findOne: jest.fn(async (): Promise<KnowledgeWikiPage | null> => null),
        find: jest.fn(async (): Promise<KnowledgeWikiPage[]> => []),
        count: jest.fn(async () => 0)
    }
    const sourceStateRepository = { update: jest.fn(async () => ({ affected: 1 })), find: jest.fn(async () => []) }
    const documentRepository = {
        find: jest.fn(async (): Promise<KnowledgeDocument[]> => []),
        findOne: jest.fn(async (): Promise<KnowledgeDocument | null> => null)
    }
    const versionRepository = { find: jest.fn(async (): Promise<KnowledgeWikiPageVersion[]> => []) }
    const contributionRepository = { find: jest.fn(async (): Promise<KnowledgeWikiPageContribution[]> => []) }
    const queue = { add: jest.fn().mockResolvedValue(undefined) }
    const manager = {
        getRepository: (entity: object) => {
            if (entity !== Knowledgebase) throw new Error('Unexpected publication target')
            return knowledgebaseRepository
        }
    }
    const dataSource = {
        transaction: jest.fn(async (work: (manager: EntityManager) => Promise<void>) =>
            work(manager as unknown as EntityManager)
        )
    }
    const jobs = jobRepository as unknown as Repository<KnowledgeWikiJob>
    const pages = pageRepository as unknown as Repository<KnowledgeWikiPage>
    const versions = versionRepository as unknown as Repository<KnowledgeWikiPageVersion>
    const contributions = contributionRepository as unknown as Repository<KnowledgeWikiPageContribution>
    const links = {} as Repository<KnowledgeWikiPageLinkEntity>
    const dispatcher = new KnowledgeWikiJobDispatcherService(
        jobs,
        queue as unknown as Queue<KnowledgeWikiGenerationQueueJob>
    )
    const jobFence = new KnowledgeWikiJobFenceService(
        knowledgebaseRepository as unknown as Repository<Knowledgebase>,
        documentRepository as unknown as Repository<KnowledgeDocument>,
        jobs
    )
    const dependencies = {
        classification: { enqueuePublished: jest.fn() },
        logger: new Logger(KnowledgeWikiGenerationService.name),
        jobRepository,
        knowledgebaseRepository,
        pageRepository,
        sourceStateRepository,
        documentRepository,
        pageVersionRepository: versionRepository,
        contributionRepository,
        mapResultRepository: { find: jest.fn(async () => []) },
        dispatcher,
        jobFence,
        lease: new KnowledgeWikiJobLeaseService(jobs),
        indexService: new KnowledgeWikiIndexService(pages, versions, links),
        projectionService: { retireSupersededVersions: jest.fn() },
        linkService: new KnowledgeWikiLinkService(pages, contributions, links),
        dataSource: dataSource as unknown as DataSource
    }
    const service = Object.assign(
        Object.create(KnowledgeWikiGenerationService.prototype),
        dependencies
    ) as KnowledgeWikiGenerationService
    Object.assign(service, {
        finalizer: Object.assign(Object.create(KnowledgeWikiFinalizeService.prototype), dependencies),
        pageReducer: Object.assign(Object.create(KnowledgeWikiPageReduceService.prototype), dependencies)
    })
    return {
        service,
        job,
        knowledgebase,
        queue,
        pageRepository,
        jobRepository,
        sourceStateRepository,
        documentRepository,
        dataSource
    }
}

describe('Wiki worker stage behavior before and after extraction', () => {
    beforeAll(async () => {
        await i18next.init({ lng: 'en', resources: {} })
    })
    beforeEach(() => jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined))
    afterEach(() => jest.restoreAllMocks())

    it('persists same-name mentions separately and hands them to identity resolution before Reduce', async () => {
        const { service, job, documentRepository, queue } = createHarness('source_map')
        job.sourceContentHash = 'hash'
        documentRepository.findOne.mockResolvedValue(
            Object.assign(new KnowledgeDocument(), {
                id: 'doc-1',
                knowledgebaseId: 'kb-1',
                name: 'Teams',
                status: KBDocumentStatusEnum.FINISH,
                contentHash: 'hash',
                chunks: [{ id: 'chunk', pageContent: 'Two distinct operations teams.' }]
            })
        )
        const save = jest.fn(async (value: object) => value)
        const completeMap = jest.fn()
        Object.assign(service, {
            modelInvocationService: {
                invokeMapModel: async () => ({
                    pages: ['north', 'south'].map((scope) => ({
                        schemaVersion: 1,
                        pageType: 'entity',
                        canonicalName: 'Operations',
                        aliases: [],
                        summary: scope,
                        identity: {
                            kind: 'entity',
                            entityType: 'organization',
                            description: `${scope} team`,
                            scope,
                            identifiers: []
                        },
                        facts: [{ text: `${scope} operates separately`, sourceChunkIds: ['chunk'] }],
                        suggestedLinks: []
                    }))
                })
            },
            mapResultRepository: { delete: jest.fn(), create: (value: object) => value, save },
            pageScheduler: { completeMap }
        })
        await service.processJob(job.id)
        expect(save).toHaveBeenCalledTimes(2)
        expect(save.mock.calls.map(([value]) => value)).toEqual([
            expect.objectContaining({
                candidateKey: '000000000000',
                normalizedPageKey: null,
                identity: expect.objectContaining({ scope: 'north' })
            }),
            expect.objectContaining({
                candidateKey: '000000000001',
                normalizedPageKey: null,
                identity: expect.objectContaining({ scope: 'south' })
            })
        ])
        expect(completeMap).toHaveBeenCalledWith(expect.objectContaining({ id: job.id }), null)
        expect(queue.add).not.toHaveBeenCalled()
    })

    it('fails a source job with entirely invalid citations without publishing an empty revision or repeating the model call', async () => {
        const { service, job, knowledgebase, documentRepository, queue } = createHarness('source_map')
        job.sourceContentHash = 'source-hash'
        documentRepository.findOne.mockResolvedValue(
            Object.assign(new KnowledgeDocument(), {
                id: 'doc-1',
                knowledgebaseId: 'kb-1',
                name: 'Strategy',
                contentHash: 'source-hash',
                status: KBDocumentStatusEnum.FINISH,
                chunks: [{ id: 'chunk-1', pageContent: 'The strategy has an owner.' }]
            })
        )
        const invocation = Object.assign(new KnowledgeWikiModelInvocation(), {
            status: 'succeeded',
            billingStatus: 'delivered',
            structuredOutput: {
                pages: [
                    {
                        schemaVersion: 1,
                        pageType: 'concept',
                        identity: { kind: 'concept', definition: 'A documented strategy.', domain: null, scope: null },
                        canonicalName: 'Strategy',
                        aliases: [],
                        summary: 'A documented strategy.',
                        suggestedLinks: [],
                        facts: [{ text: 'The strategy has an owner.', sourceChunkIds: ['id:foreign-chunk'] }]
                    }
                ]
            }
        })
        const invocations = {
            create: (input: Partial<KnowledgeWikiModelInvocation>) =>
                Object.assign(new KnowledgeWikiModelInvocation(), input),
            findOne: async () => invocation
        }
        const manager = {
            getRepository: (entity: object) =>
                entity === KnowledgeWikiJob ? { findOne: async () => job } : invocations
        }
        const dataSource = {
            transaction: (work: (manager: EntityManager) => Promise<KnowledgeWikiModelInvocation>) =>
                work(manager as unknown as EntityManager)
        }
        const modelRuntime = { createModelClient: jest.fn() }
        const commandBus = { execute: jest.fn() }
        Object.assign(service, {
            modelInvocationService: new KnowledgeWikiModelInvocationService(
                invocations as never,
                modelRuntime as never,
                commandBus as never,
                new KnowledgeWikiInvocationBudgetService(dataSource as unknown as DataSource)
            )
        })

        await expect(service.processJob(job.id)).rejects.toThrow('Wiki citation validation failed')

        expect(job).toMatchObject({
            status: 'failed',
            error: expect.stringContaining('Wiki citation validation failed')
        })
        expect(knowledgebase).toMatchObject({ wikiStatus: 'failed', wikiActiveRevision: 1, wikiStagedRevision: 2 })
        expect(queue.add).not.toHaveBeenCalled()
        expect(modelRuntime.createModelClient).not.toHaveBeenCalled()
        expect(commandBus.execute).not.toHaveBeenCalled()
    })

    it('waits for outstanding reductions without publishing the new revision', async () => {
        const { service, job, knowledgebase, queue, dataSource } = createHarness('finalize', [{ status: 'running' }])
        const result = await service.processJob(job.id)
        expect(result.status).toBe('queued')
        expect(knowledgebase.wikiActiveRevision).toBe(1)
        expect(dataSource.transaction).not.toHaveBeenCalled()
        expect(queue.add).toHaveBeenCalledWith(
            expect.objectContaining({ jobId: job.id }),
            expect.objectContaining({ delay: 1500 })
        )
    })

    it('preserves published Wiki when a rebuild unexpectedly finds no sources', async () => {
        const { service, job, knowledgebase, pageRepository, queue } = createHarness('rebuild')
        job.expectedChildren = 5
        pageRepository.count.mockResolvedValue(18)
        await expect(service.processJob(job.id)).rejects.toThrow('Wiki rebuild found no usable sources')
        expect(knowledgebase.wikiActiveRevision).toBe(1)
        expect(knowledgebase.wikiAvailability).toBe('degraded')
        expect(queue.add).not.toHaveBeenCalled()
    })

    it('refuses an empty rebuild publication even when the earlier source guard was bypassed', async () => {
        const { service, job, knowledgebase, jobRepository, pageRepository, dataSource } = createHarness('finalize')
        jobRepository.findOne.mockImplementation(async ({ where }) =>
            where.id === job.id
                ? Object.assign(new KnowledgeWikiJob(), job)
                : Object.assign(new KnowledgeWikiJob(), { id: job.parentJobId, type: 'rebuild', expectedChildren: 0 })
        )
        pageRepository.count.mockResolvedValue(18)
        await expect(service.processJob(job.id)).rejects.toThrow('Wiki rebuild produced no publishable pages')
        expect(knowledgebase.wikiActiveRevision).toBe(1)
        expect(dataSource.transaction).not.toHaveBeenCalled()
    })

    it('reports failed reductions without activating the staged revision', async () => {
        const { service, job, knowledgebase, dataSource } = createHarness('finalize', [{ status: 'failed' }])
        await expect(service.processJob(job.id)).rejects.toThrow('One or more Wiki page reductions failed')
        expect(job.status).toBe('failed')
        expect(knowledgebase.wikiActiveRevision).toBe(1)
        expect(knowledgebase.wikiStatus).toBe('failed')
        expect(dataSource.transaction).not.toHaveBeenCalled()
    })

    it('publishes an empty completed generation and clears its source pending flag', async () => {
        const { service, job, knowledgebase, sourceStateRepository } = createHarness('finalize')
        const result = await service.processJob(job.id)
        expect(result.status).toBe('succeeded')
        expect(knowledgebase).toMatchObject({ wikiStatus: 'ready', wikiActiveRevision: 2, wikiStagedRevision: null })
        expect(sourceStateRepository.update).toHaveBeenCalledWith(
            { knowledgebaseId: 'kb-1', sourceDocumentIdSnapshot: 'doc-1', lifecycleGeneration: 2 },
            { generationPending: false, generationPendingReason: null }
        )
    })

    it('rejects a reduce job without a page key', async () => {
        const { service, job } = createHarness('page_reduce')
        await expect(service.processJob(job.id)).rejects.toThrow('Wiki reduce job is missing its page key')
        expect(job.status).toBe('failed')
    })

    it('completes a reduction with no page without invoking a model or publishing a revision', async () => {
        const { service, job, knowledgebase } = createHarness('page_reduce')
        job.pageKey = 'entity:missing'
        const result = await service.processJob(job.id)
        expect(result.status).toBe('succeeded')
        expect(knowledgebase.wikiActiveRevision).toBe(1)
    })

    it('does not replace an existing page when all reduction sources are ineligible', async () => {
        const { service, job, pageRepository } = createHarness('page_reduce')
        job.pageKey = 'entity:xpert'
        const page = Object.assign(new KnowledgeWikiPage(), {
            id: 'page-1',
            pageKey: job.pageKey,
            activeVersionId: 'v1'
        })
        pageRepository.findOne.mockResolvedValue(page)
        const result = await service.processJob(job.id)
        expect(result.status).toBe('succeeded')
        expect(page.activeVersionId).toBe('v1')
    })
})
