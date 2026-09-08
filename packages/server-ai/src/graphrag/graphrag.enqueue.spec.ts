import { KnowledgeGraphIndexJobStatus } from '@xpert-ai/contracts'
import { GraphragService } from './graphrag.service'

describe('GraphRAG empty enqueue completion', () => {
    function fixture(sources: Array<{ id: string; contentHash?: string | null }>, existingStatus?: string) {
        const knowledgebase = { id: 'kb', graphRag: { enabled: true }, graphRevision: 0, graphStatus: 'ready' }
        const jobRepository = {
            create: jest.fn((job: object) => job),
            save: jest.fn(async (job: object) => ({ ...job, id: 'job' })),
            count: jest.fn(async ({ where }: { where: { status: string } }) =>
                where.status === existingStatus ? 1 : 0
            )
        }
        const graphQueue = { add: jest.fn() }
        const clearKnowledgebase = jest.fn()
        const service = Object.assign(Object.create(GraphragService.prototype), {
            knowledgebaseService: { findOne: async () => knowledgebase },
            knowledgebaseRepository: {
                update: async (_id: string, patch: object) => Object.assign(knowledgebase, patch)
            },
            documentService: { findAll: async () => ({ items: sources }) },
            jobRepository,
            graphQueue,
            clearKnowledgebase,
            syncEntityVectors: jest.fn()
        }) as GraphragService
        return { service, knowledgebase, jobRepository, graphQueue, clearKnowledgebase }
    }

    it.each([{ sources: [] }, { sources: [{ id: 'doc', contentHash: null }] }])(
        'settles a request with no eligible sources: %j',
        async ({ sources }) => {
            const { service, knowledgebase, jobRepository, graphQueue } = fixture(sources)
            await expect(
                service.enqueueDocuments({ knowledgebaseId: 'kb', documentIds: ['doc'], reason: 'document' })
            ).resolves.toEqual([])
            expect(knowledgebase.graphStatus).toBe('ready')
            expect(jobRepository.save).not.toHaveBeenCalled()
            expect(graphQueue.add).not.toHaveBeenCalled()
        }
    )

    it('completes a rebuild whose only document is a hashless Wiki projection', async () => {
        const { service, knowledgebase, clearKnowledgebase } = fixture([{ id: 'wiki-projection', contentHash: null }])
        await expect(service.rebuildKnowledgebase('kb')).resolves.toEqual([])
        expect(clearKnowledgebase).toHaveBeenCalledWith('kb')
        expect(knowledgebase.graphStatus).toBe('ready')
    })

    it.each([
        [KnowledgeGraphIndexJobStatus.QUEUED, 'indexing'],
        [KnowledgeGraphIndexJobStatus.RUNNING, 'indexing'],
        [KnowledgeGraphIndexJobStatus.FAILED, 'failed']
    ])('preserves existing %s work when every requested source is skipped', async (existingStatus, expectedStatus) => {
        const { service, knowledgebase } = fixture([{ id: 'doc', contentHash: null }], existingStatus)
        await service.enqueueDocuments({ knowledgebaseId: 'kb', documentIds: ['doc'], reason: 'document' })
        expect(knowledgebase.graphStatus).toBe(expectedStatus)
    })

    it('keeps indexing when the request contains an eligible document', async () => {
        const { service, knowledgebase, graphQueue } = fixture([
            { id: 'empty', contentHash: null },
            { id: 'doc', contentHash: 'hash' }
        ])
        const jobs = await service.enqueueDocuments({
            knowledgebaseId: 'kb',
            documentIds: ['empty', 'doc'],
            reason: 'document'
        })
        expect(jobs).toHaveLength(1)
        expect(graphQueue.add).toHaveBeenCalledTimes(1)
        expect(knowledgebase.graphStatus).toBe('indexing')
    })
})
