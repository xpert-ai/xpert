import { KnowledgeGraphIndexJobStatus } from '@xpert-ai/contracts'
import { KnowledgeGraphIndexJob } from './entities/knowledge-graph-index-job.entity'
import { GraphragService } from './graphrag.service'

describe('Graph index job stage persistence', () => {
    function setup() {
        const knowledgebase = { id: 'kb', graphRag: { enabled: true } }
        const job = Object.assign(new KnowledgeGraphIndexJob(), {
            id: 'job',
            knowledgebaseId: 'kb',
            documentId: 'doc',
            knowledgebase,
            sourceContentHash: 'hash',
            sourcePublicationEpoch: 1,
            status: KnowledgeGraphIndexJobStatus.QUEUED
        })
        const source = { id: 'doc', contentHash: 'hash', publicationEpoch: 1 }
        const jobRepository = {
            findOne: jest.fn().mockResolvedValue(job),
            update: jest.fn(async (_id: string, patch: Partial<KnowledgeGraphIndexJob>) => {
                Object.assign(job, patch)
            }),
            count: jest.fn().mockResolvedValue(0)
        }
        const extract = jest.fn(async () => {
            expect(job.stage).toBe('extraction')
            return { entities: [], relations: [] }
        })
        const persist = jest.fn(async () => {
            expect(job.stage).toBe('persistence')
            return []
        })
        const sync = jest.fn(async () => {
            expect(job.stage).toBe('indexing')
        })
        const documentService = { findOne: jest.fn().mockResolvedValue(source) }
        const chunkService = { findAll: jest.fn().mockResolvedValue({ items: [{ id: 'chunk', pageContent: 'text' }] }) }
        const service = Object.create(GraphragService.prototype) as GraphragService
        Object.assign(service, {
            jobRepository,
            documentService,
            chunkService,
            knowledgebaseRepository: { update: jest.fn() },
            clearDocument: jest.fn(),
            isTextChunk: () => true,
            extractDocumentGraph: extract,
            persistExtraction: persist,
            refreshEntityMentionCounts: jest.fn(),
            syncEntityVectors: sync
        })
        return { service, job, jobRepository, extract, persist, sync, documentService, chunkService }
    }

    it('records each stage before its work and success only after vector indexing returns', async () => {
        const { service, job, sync, extract } = setup()
        let finishIndexing: () => void
        sync.mockImplementation(
            () =>
                new Promise<void>((resolve) => {
                    expect(job.stage).toBe('indexing')
                    expect(job.status).toBe(KnowledgeGraphIndexJobStatus.RUNNING)
                    expect(job.result).toBeNull()
                    finishIndexing = resolve
                })
        )
        const processing = service.processIndexJob('job')
        // Advance the finite mocked extraction/persistence steps to the pending index operation.
        for (let index = 0; index < 30 && !finishIndexing; index++) await Promise.resolve()
        expect(finishIndexing).toBeDefined()
        finishIndexing()
        await processing
        expect(extract).toHaveBeenCalledWith(job, expect.any(Array))
        expect(job).toMatchObject({ status: KnowledgeGraphIndexJobStatus.SUCCESS, result: 'indexed' })
    })

    it.each(['extraction', 'persistence', 'indexing'] as const)('retains %s on failure', async (stage) => {
        const { service, job, extract, persist, sync } = setup()
        const failing = { extraction: extract, persistence: persist, indexing: sync }[stage]
        failing.mockRejectedValueOnce(new Error('stage failed'))
        await service.processIndexJob('job')
        expect(job).toMatchObject({
            stage,
            status: KnowledgeGraphIndexJobStatus.FAILED,
            error: 'stage failed',
            result: null
        })
    })

    it('records empty text as skipped content rather than indexed success', async () => {
        const { service, job, chunkService, extract } = setup()
        chunkService.findAll.mockResolvedValue({ items: [] })
        await service.processIndexJob('job')
        expect(job.result).toBe('empty')
        expect(extract).not.toHaveBeenCalled()
    })

    it('records an obsolete source as superseded before extraction', async () => {
        const { service, job, documentService, extract } = setup()
        documentService.findOne.mockResolvedValue({ id: 'doc', contentHash: 'new', publicationEpoch: 2 })
        await service.processIndexJob('job')
        expect(job.result).toBe('superseded')
        expect(extract).not.toHaveBeenCalled()
    })

    it('rejects an earlier publication after extraction even when the content hash returns to its original value', async () => {
        const { service, job, documentService, extract, persist, sync } = setup()
        extract.mockImplementation(async () => {
            documentService.findOne.mockResolvedValue({ id: 'doc', contentHash: 'hash', publicationEpoch: 3 })
            return { entities: [], relations: [] }
        })
        await service.processIndexJob('job')
        expect(job.result).toBe('superseded')
        expect(persist).not.toHaveBeenCalled()
        expect(sync).not.toHaveBeenCalled()
    })

    it('records disabled Graph without claiming a generated graph', async () => {
        const { service, job, extract } = setup()
        job.knowledgebase.graphRag.enabled = false
        await service.processIndexJob('job')
        expect(job.result).toBe('disabled')
        expect(extract).not.toHaveBeenCalled()
    })
})
