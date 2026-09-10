import { NotFoundException } from '@nestjs/common'
import { KBDocumentStatusEnum, KnowledgeGraphIndexJobStatus } from '@xpert-ai/contracts'
import { EntityManager, Repository } from 'typeorm'
import { KnowledgeDocument } from '../knowledge-document/document.entity'
import { Knowledgebase } from '../knowledgebase/knowledgebase.entity'
import { KnowledgebaseService } from '../knowledgebase/knowledgebase.service'
import { KnowledgeGraphRetryDocumentCommand } from './commands'
import { KnowledgeGraphRetryDocumentHandler } from './commands/handlers/retry-document.handler'
import { KnowledgeGraphIndexJob } from './entities'
import { GraphragService } from './graphrag.service'

describe('Graph document retry', () => {
    function fixture() {
        const knowledgebase = {
            id: 'kb',
            tenantId: 'tenant',
            organizationId: 'org',
            graphRag: { enabled: true },
            graphRevision: 2
        }
        const document = Object.assign(new KnowledgeDocument(), {
            id: 'doc',
            contentHash: 'hash',
            publicationEpoch: 1,
            status: KBDocumentStatusEnum.FINISH
        })
        const latest = Object.assign(new KnowledgeGraphIndexJob(), {
            status: KnowledgeGraphIndexJobStatus.FAILED,
            sourceContentHash: 'hash',
            sourcePublicationEpoch: 1,
            revision: 2
        })
        const documents = { findOne: jest.fn().mockResolvedValue(document) }
        const jobs = {
            findOne: jest.fn().mockResolvedValue(latest),
            create: (value: Partial<KnowledgeGraphIndexJob>) => Object.assign(new KnowledgeGraphIndexJob(), value),
            save: jest.fn(async (value: KnowledgeGraphIndexJob) => Object.assign(value, { id: 'retry' }))
        }
        const knowledgebases = { findOneOrFail: async () => knowledgebase, update: jest.fn() }
        let inTransaction = false
        const manager = {
            query: jest.fn().mockResolvedValue([]),
            getRepository: jest.fn((entity: unknown) =>
                entity === KnowledgeDocument ? documents : entity === Knowledgebase ? knowledgebases : jobs
            )
        }
        const graph = {
            dispatchJobs: jest.fn(async () => {
                expect(inTransaction).toBe(false)
            })
        }
        const handler = new KnowledgeGraphRetryDocumentHandler(
            { findOneByIdString: jest.fn().mockResolvedValue(knowledgebase) } as unknown as KnowledgebaseService,
            graph as unknown as GraphragService,
            {
                manager: {
                    transaction: async (run: (value: EntityManager) => Promise<unknown>) => {
                        inTransaction = true
                        try {
                            return await run(manager as unknown as EntityManager)
                        } finally {
                            inTransaction = false
                        }
                    }
                }
            } as unknown as Repository<KnowledgeGraphIndexJob>
        )
        const retry = () =>
            handler.execute(
                new KnowledgeGraphRetryDocumentCommand({ knowledgebaseId: 'kb', documentId: 'doc', userId: 'user' })
            )
        return { retry, document, latest, knowledgebase, graph, documents, jobs, manager }
    }

    it('retries the failed current source without requiring a content change', async () => {
        const { retry, graph, documents, jobs, manager } = fixture()
        await retry()
        expect(manager.query).toHaveBeenCalledWith(expect.stringContaining('pg_advisory_xact_lock'), expect.any(Array))
        expect(documents.findOne).toHaveBeenCalledWith({
            where: {
                tenantId: 'tenant',
                organizationId: 'org',
                knowledgebaseId: 'kb',
                id: 'doc'
            }
        })
        expect(jobs.findOne).toHaveBeenCalledWith(expect.objectContaining({ order: { createdAt: 'DESC', id: 'DESC' } }))
        expect(graph.dispatchJobs).toHaveBeenCalledWith(
            [expect.objectContaining({ id: 'retry', documentId: 'doc', sourceContentHash: 'hash', status: 'queued' })],
            'user'
        )
    })

    it.each([
        KnowledgeGraphIndexJobStatus.SUCCESS,
        KnowledgeGraphIndexJobStatus.QUEUED,
        KnowledgeGraphIndexJobStatus.RUNNING,
        KnowledgeGraphIndexJobStatus.CANCELLED
    ])('does not retry %s work', async (status) => {
        const { retry, latest, graph } = fixture()
        latest.status = status
        await retry()
        expect(graph.dispatchJobs).not.toHaveBeenCalled()
    })

    it.each(['hash', 'epoch', 'revision', 'disabled', 'source_disabled', 'deleted', 'processing', 'no_hash', 'no_job'])(
        'does not revive ineligible work: %s',
        async (condition) => {
            const { retry, document, knowledgebase, jobs, graph } = fixture()
            if (condition === 'hash') document.contentHash = 'new'
            if (condition === 'epoch') document.publicationEpoch++
            if (condition === 'revision') knowledgebase.graphRevision++
            if (condition === 'disabled') knowledgebase.graphRag.enabled = false
            if (condition === 'source_disabled') document.disabled = true
            if (condition === 'deleted') document.hardDeletePendingAt = new Date()
            if (condition === 'processing') document.status = KBDocumentStatusEnum.RUNNING
            if (condition === 'no_hash') document.contentHash = null
            if (condition === 'no_job') jobs.findOne.mockResolvedValue(null)
            await retry()
            expect(graph.dispatchJobs).not.toHaveBeenCalled()
        }
    )

    it('rejects a document outside the authorized scope', async () => {
        const { retry, documents, graph } = fixture()
        documents.findOne.mockResolvedValue(null)
        await expect(retry()).rejects.toBeInstanceOf(NotFoundException)
        expect(graph.dispatchJobs).not.toHaveBeenCalled()
    })

    it('propagates dispatch failure so a manual retry does not report success', async () => {
        const { retry, graph } = fixture()
        graph.dispatchJobs.mockRejectedValue(new Error('queue unavailable'))
        await expect(retry()).rejects.toThrow('queue unavailable')
    })
})
