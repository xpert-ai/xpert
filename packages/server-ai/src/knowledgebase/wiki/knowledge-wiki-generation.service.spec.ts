import { ForbiddenException } from '@nestjs/common'
import { AiModelTypeEnum, KBDocumentStatusEnum, KnowledgebaseTypeEnum } from '@xpert-ai/contracts'
import { KnowledgeDocument } from '../../knowledge-document/document.entity'
import { Knowledgebase } from '../knowledgebase.entity'
import { KnowledgeWikiJob, KnowledgeWikiSourceState } from './entities'
import { createKnowledgeWikiConfigFingerprint, resolveKnowledgeWikiModel } from './knowledge-wiki-config'
import { KnowledgeWikiGenerationService } from './knowledge-wiki-generation.service'
import { KnowledgeWikiJobLeaseService } from './knowledge-wiki-job-lease.service'
import { Repository } from 'typeorm'

function createService(enabled = true) {
    const knowledgebase = Object.assign(new Knowledgebase(), {
        id: 'kb-1',
        tenantId: 'tenant-1',
        organizationId: 'org-1',
        type: KnowledgebaseTypeEnum.Standard,
        wikiConfig: { enabled, extractionGranularity: 'standard' as const },
        wikiStatus: 'ready' as const,
        wikiActiveRevision: 0,
        chatModel: { id: 'model-1', copilotId: 'copilot-1', modelType: AiModelTypeEnum.LLM, model: 'chat-model' }
    })
    knowledgebase.wikiConfigFingerprint = createKnowledgeWikiConfigFingerprint(
        knowledgebase.wikiConfig,
        resolveKnowledgeWikiModel(knowledgebase)
    )
    const document = Object.assign(new KnowledgeDocument(), {
        id: 'doc-1',
        knowledgebaseId: knowledgebase.id,
        status: KBDocumentStatusEnum.FINISH,
        contentHash: 'source-hash',
        chunks: []
    })
    const dispatcher = { dispatch: jest.fn().mockResolvedValue(undefined) }
    const knowledgebaseService = { assertKnowledgebaseWriteAccess: jest.fn().mockResolvedValue(knowledgebase) }
    const documentRepository = { findOne: jest.fn().mockResolvedValue(document) }
    const jobRepository = {
        findOne: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue({ affected: 1 }),
        create: jest.fn((input: Partial<KnowledgeWikiJob>) => Object.assign(new KnowledgeWikiJob(), input)),
        save: jest.fn(async (job: KnowledgeWikiJob) => Object.assign(job, { id: 'job-1' }))
    }
    const sourceStateRepository = {
        findOne: jest.fn().mockResolvedValue(null),
        create: jest.fn((input: Partial<KnowledgeWikiSourceState>) =>
            Object.assign(new KnowledgeWikiSourceState(), input)
        ),
        save: jest.fn(async (state: KnowledgeWikiSourceState) => state)
    }
    const invocationRepository = { count: jest.fn().mockResolvedValue(0) }
    const service = Object.create(KnowledgeWikiGenerationService.prototype) as KnowledgeWikiGenerationService
    Object.assign(service, {
        knowledgebaseService,
        lease: new KnowledgeWikiJobLeaseService(jobRepository as unknown as Repository<KnowledgeWikiJob>),
        jobFence: {
            loadKnowledgebase: jest.fn().mockResolvedValue(knowledgebase),
            findEligibleDocuments: jest.fn().mockResolvedValue([document])
        },
        knowledgebaseRepository: { update: jest.fn().mockResolvedValue({ affected: 1 }) },
        documentRepository,
        jobRepository,
        sourceStateRepository,
        invocationRepository,
        contributionRepository: { find: jest.fn().mockResolvedValue([]) },
        dispatcher
    })
    return {
        service,
        dispatcher,
        documentRepository,
        knowledgebaseService,
        sourceStateRepository,
        jobRepository,
        invocationRepository
    }
}

describe('KnowledgeWikiGenerationService access', () => {
    it('retries known local failures without another charge confirmation or a new generation attempt', async () => {
        const { service, jobRepository, dispatcher } = createService()
        jobRepository.findOne.mockResolvedValue(
            Object.assign(new KnowledgeWikiJob(), {
                id: 'job-1',
                knowledgebaseId: 'kb-1',
                isCurrent: true,
                status: 'failed',
                generationAttempt: 0
            })
        )

        await expect(
            service.retry({ knowledgebaseId: 'kb-1', jobId: 'job-1', userId: 'user-1' })
        ).resolves.toMatchObject({ status: 'queued', generationAttempt: 0 })
        expect(dispatcher.dispatch).toHaveBeenCalledTimes(1)
    })

    it('does not queue an uncertain model invocation without explicit charge confirmation', async () => {
        const { service, jobRepository, invocationRepository, dispatcher } = createService()
        jobRepository.findOne.mockResolvedValue(
            Object.assign(new KnowledgeWikiJob(), {
                id: 'job-1',
                knowledgebaseId: 'kb-1',
                isCurrent: true,
                status: 'failed',
                generationAttempt: 0
            })
        )
        invocationRepository.count.mockResolvedValue(1)

        await expect(service.retry({ knowledgebaseId: 'kb-1', jobId: 'job-1', userId: 'user-1' })).rejects.toThrow()
        expect(dispatcher.dispatch).not.toHaveBeenCalled()
    })

    it('renews a running job lease while a model call takes longer than five minutes', async () => {
        jest.useFakeTimers()
        const { service, jobRepository } = createService()
        const job = Object.assign(new KnowledgeWikiJob(), {
            id: 'job-1',
            type: 'source_map',
            status: 'queued',
            executionAttempt: 0,
            isCurrent: true
        })
        jobRepository.findOne.mockResolvedValue(job)
        let finish: () => void
        const work = new Promise<void>((resolve) => {
            finish = resolve
        })
        Object.assign(service, { processSourceMap: () => work })
        const running = service.processJob(job.id)
        try {
            await jest.advanceTimersByTimeAsync(6 * 60_000)
            expect(jobRepository.update).toHaveBeenCalledWith(
                expect.objectContaining({ id: 'job-1', executionAttempt: 1, status: 'running' }),
                expect.objectContaining({ heartbeatAt: expect.any(Date), leaseExpiresAt: expect.any(Date) })
            )
        } finally {
            finish()
            await running
            expect(jest.getTimerCount()).toBe(0)
            jest.useRealTimers()
        }
    })

    it('automatically enqueues a published source without an organization feature grant', async () => {
        const { service, dispatcher, sourceStateRepository } = createService()

        await expect(
            service.enqueueSource({
                knowledgebaseId: 'kb-1',
                documentId: 'doc-1',
                userId: 'user-1',
                reason: 'document'
            })
        ).resolves.toMatchObject({ type: 'source_map', status: 'queued', billingPrincipalId: 'user-1' })

        expect(sourceStateRepository.save).toHaveBeenCalledWith(
            expect.objectContaining({ eligible: true, generationPending: true, desiredRootJobId: 'job-1' })
        )
        expect(dispatcher.dispatch).toHaveBeenCalledWith(expect.objectContaining({ id: 'job-1' }), 'user-1')
    })

    it('does not generate Wiki for a knowledgebase that has not enabled it', async () => {
        const { service, dispatcher, documentRepository } = createService(false)

        await expect(
            service.enqueueSource({
                knowledgebaseId: 'kb-1',
                documentId: 'doc-1',
                userId: 'user-1',
                reason: 'document'
            })
        ).resolves.toBeNull()

        expect(documentRepository.findOne).not.toHaveBeenCalled()
        expect(dispatcher.dispatch).not.toHaveBeenCalled()
    })

    it('allows an authorized writer to rebuild without an organization feature grant', async () => {
        const { service, dispatcher, knowledgebaseService } = createService()

        await expect(
            service.rebuild({ knowledgebaseId: 'kb-1', userId: 'user-1', confirmModelCharges: true })
        ).resolves.toMatchObject({ type: 'rebuild', status: 'queued' })

        expect(knowledgebaseService.assertKnowledgebaseWriteAccess).toHaveBeenCalledWith('kb-1', {
            select: { id: true }
        })
        expect(dispatcher.dispatch).toHaveBeenCalledTimes(1)
    })

    it('continues to reject rebuild and retry without knowledgebase write access', async () => {
        const { service, dispatcher, knowledgebaseService } = createService()
        knowledgebaseService.assertKnowledgebaseWriteAccess.mockRejectedValue(new ForbiddenException())

        await expect(
            service.rebuild({ knowledgebaseId: 'kb-1', userId: 'reader-1', confirmModelCharges: true })
        ).rejects.toBeInstanceOf(ForbiddenException)
        await expect(
            service.retry({ knowledgebaseId: 'kb-1', jobId: 'job-1', userId: 'reader-1' })
        ).rejects.toBeInstanceOf(ForbiddenException)
        expect(dispatcher.dispatch).not.toHaveBeenCalled()
    })
})
