import type { Repository } from 'typeorm'
import { Knowledgebase } from '../knowledgebase.entity'
import {
    KnowledgeWikiJob,
    KnowledgeWikiPage,
    KnowledgeWikiPageContribution,
    KnowledgeWikiSourceState
} from './entities'
import { KnowledgeWikiJobDispatcherService } from './knowledge-wiki-job-dispatcher.service'
import { KnowledgeWikiProjectionService } from './knowledge-wiki-projection.service'
import { KnowledgeWikiRetractionService } from './knowledge-wiki-retraction.service'

function createService(input: {
    knowledgebase: Partial<Knowledgebase>
    state?: Partial<KnowledgeWikiSourceState> | null
    contributions?: Partial<KnowledgeWikiPageContribution>[]
}) {
    const knowledgebaseRepository = {
        findOne: jest.fn().mockResolvedValue(Object.assign(new Knowledgebase(), input.knowledgebase))
    }
    const state = input.state === null ? null : Object.assign(new KnowledgeWikiSourceState(), input.state)
    const sourceStateRepository = {
        findOne: jest.fn().mockResolvedValue(state),
        create: jest.fn().mockImplementation((value) => Object.assign(new KnowledgeWikiSourceState(), value)),
        save: jest.fn().mockImplementation(async (value) => Object.assign(value, { id: value.id ?? 'state-1' })),
        update: jest.fn().mockResolvedValue({ affected: 1 })
    }
    const contributionRepository = {
        find: jest.fn().mockResolvedValue(input.contributions ?? [])
    }
    const pageRepository = {
        find: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({ affected: 1 })
    }
    const jobRepository = {
        query: jest.fn().mockResolvedValue([]),
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation((value) => Object.assign(new KnowledgeWikiJob(), value)),
        save: jest.fn().mockImplementation(async (value) => Object.assign(value, { id: value.id ?? 'job-1' })),
        update: jest.fn().mockResolvedValue({ affected: 1 })
    }
    const projectionService = { retireVersions: jest.fn() }
    const dispatcher = { dispatch: jest.fn(), markSucceeded: jest.fn() }
    const service = new KnowledgeWikiRetractionService(
        knowledgebaseRepository as unknown as Repository<Knowledgebase>,
        jobRepository as unknown as Repository<KnowledgeWikiJob>,
        pageRepository as unknown as Repository<KnowledgeWikiPage>,
        contributionRepository as unknown as Repository<KnowledgeWikiPageContribution>,
        sourceStateRepository as unknown as Repository<KnowledgeWikiSourceState>,
        projectionService as unknown as KnowledgeWikiProjectionService,
        dispatcher as unknown as KnowledgeWikiJobDispatcherService
    )
    return {
        service,
        sourceStateRepository,
        pageRepository,
        jobRepository,
        projectionService,
        dispatcher
    }
}

describe('KnowledgeWikiRetractionService', () => {
    it('invalidates affected pages before dispatching a durable retract job', async () => {
        const fixture = createService({
            knowledgebase: {
                id: 'kb-1',
                tenantId: 'tenant-1',
                organizationId: 'org-1',
                wikiActiveRevision: 3,
                wikiConfigFingerprint: 'fingerprint-1',
                wikiGeneratorVersion: 'wiki-v1'
            },
            state: {
                id: 'state-1',
                knowledgebaseId: 'kb-1',
                sourceDocumentIdSnapshot: 'document-1',
                lifecycleGeneration: 2,
                eligible: true
            },
            contributions: [{ pageId: 'page-1' }, { pageId: 'page-1' }, { pageId: 'page-2' }]
        })

        const job = await fixture.service.enqueue({
            knowledgebaseId: 'kb-1',
            documentId: 'document-1',
            userId: 'user-1',
            reason: 'hard_deleted'
        })

        expect(fixture.sourceStateRepository.save).toHaveBeenCalledWith(
            expect.objectContaining({
                lifecycleGeneration: 3,
                lastEventType: 'hard_deleted',
                eligible: false,
                cleanupPending: true
            })
        )
        expect(fixture.pageRepository.update).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ status: 'stale', projectionStatus: 'disabled' })
        )
        expect(job).toEqual(expect.objectContaining({ type: 'retract', status: 'queued' }))
        expect(fixture.dispatcher.dispatch).toHaveBeenCalledWith(expect.objectContaining({ id: 'job-1' }), 'user-1')
    })

    it('physically retires projections and completes cleanup without model work when Wiki is disabled', async () => {
        const fixture = createService({
            knowledgebase: {
                id: 'kb-1',
                tenantId: 'tenant-1',
                wikiConfig: { enabled: false, extractionGranularity: 'standard' }
            },
            state: {
                id: 'state-1',
                knowledgebaseId: 'kb-1',
                sourceDocumentIdSnapshot: 'document-1',
                lifecycleGeneration: 4,
                eligible: false,
                cleanupPending: true
            },
            contributions: [{ pageId: 'page-1', pageVersionId: 'version-1' }]
        })
        const job = Object.assign(new KnowledgeWikiJob(), {
            id: 'job-1',
            knowledgebaseId: 'kb-1',
            sourceDocumentIdSnapshot: 'document-1',
            sourceLifecycleGeneration: 4,
            type: 'retract'
        })

        await fixture.service.process(job)

        expect(fixture.projectionService.retireVersions).toHaveBeenCalledWith(expect.objectContaining({ id: 'kb-1' }), [
            'version-1'
        ])
        expect(fixture.sourceStateRepository.update).toHaveBeenCalledWith(
            'state-1',
            expect.objectContaining({ cleanupPending: false, generationPending: false })
        )
        expect(fixture.dispatcher.markSucceeded).toHaveBeenCalledWith('job-1')
        expect(fixture.dispatcher.dispatch).not.toHaveBeenCalled()
    })
})
