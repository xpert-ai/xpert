import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common'
import { KBDocumentStatusEnum, KnowledgeGraphIndexJobStatus } from '@xpert-ai/contracts'
import { EntityManager, Repository } from 'typeorm'
import { KnowledgeDocument } from '../knowledge-document/document.entity'
import { KnowledgebaseService } from '../knowledgebase/knowledgebase.service'
import { KnowledgeGraphIndexJob } from './entities/knowledge-graph-index-job.entity'
import { GraphDocumentProgressService } from './document-progress.service'

describe('Graph document progress query', () => {
    function setup() {
        const knowledgebaseService = {
            findOneByIdString: jest.fn().mockResolvedValue({
                id: 'kb',
                tenantId: 'tenant',
                organizationId: 'org',
                graphRag: { enabled: true },
                graphRevision: 2
            })
        }
        const documents = {
            find: jest.fn().mockResolvedValue([]),
            findOne: jest.fn().mockResolvedValue({
                id: 'old-doc',
                status: KBDocumentStatusEnum.FINISH,
                contentHash: 'hash',
                publicationEpoch: 1
            })
        }
        const jobs = {
            findOne: jest.fn().mockResolvedValue({
                documentId: 'old-doc',
                sourceContentHash: 'hash',
                sourcePublicationEpoch: 1,
                revision: 2,
                status: KnowledgeGraphIndexJobStatus.SUCCESS,
                result: 'indexed'
            })
        }
        const query = {
            distinctOn: jest.fn().mockReturnThis(),
            where: jest.fn().mockReturnThis(),
            orderBy: jest.fn().mockReturnThis(),
            addOrderBy: jest.fn().mockReturnThis(),
            getMany: jest.fn().mockResolvedValue([])
        }
        const batchJobs = { ...jobs, createQueryBuilder: jest.fn(() => query) }
        const manager = {
            getRepository: jest.fn((entity: unknown) => (entity === KnowledgeDocument ? documents : batchJobs))
        }
        const transaction = jest.fn(
            async (_isolation: string, callback: (manager: EntityManager) => Promise<unknown>) =>
                callback(manager as unknown as EntityManager)
        )
        const service = new GraphDocumentProgressService(
            knowledgebaseService as unknown as KnowledgebaseService,
            { manager: { transaction } } as unknown as Repository<KnowledgeGraphIndexJob>
        )
        return { service, knowledgebaseService, documents, jobs, transaction, query }
    }

    it('queries the selected document independently of the latest 50 knowledgebase jobs', async () => {
        const { service, documents, jobs, transaction } = setup()
        expect(await service.getProgress('kb', 'old-doc')).toMatchObject({ documentId: 'old-doc', state: 'ready' })
        expect(transaction).toHaveBeenCalledWith('REPEATABLE READ', expect.any(Function))
        expect(documents.findOne).toHaveBeenCalledWith(
            expect.objectContaining({
                where: {
                    id: 'old-doc',
                    knowledgebaseId: 'kb',
                    tenantId: 'tenant',
                    organizationId: 'org'
                }
            })
        )
        expect(jobs.findOne).toHaveBeenCalledWith({
            where: { documentId: 'old-doc', knowledgebaseId: 'kb', tenantId: 'tenant', organizationId: 'org' },
            order: { createdAt: 'DESC', id: 'DESC' }
        })
    })

    it('checks knowledgebase access before reading jobs or documents', async () => {
        const { service, knowledgebaseService, transaction } = setup()
        knowledgebaseService.findOneByIdString.mockRejectedValue(new ForbiddenException())
        await expect(service.getProgress('kb', 'old-doc')).rejects.toBeInstanceOf(ForbiddenException)
        expect(transaction).not.toHaveBeenCalled()
    })

    it('does not reveal jobs for documents outside the authorized knowledgebase', async () => {
        const { service, documents, jobs } = setup()
        documents.findOne.mockResolvedValue(null)
        await expect(service.getProgress('kb', 'other-doc')).rejects.toBeInstanceOf(NotFoundException)
        expect(jobs.findOne).not.toHaveBeenCalled()
    })

    const ids = Array.from({ length: 100 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`)

    it('reads 100 document states in one snapshot with two bounded queries', async () => {
        const { service, documents, query, transaction, knowledgebaseService } = setup()
        documents.find.mockResolvedValue(
            ids.map((id) => ({
                id,
                status: KBDocumentStatusEnum.FINISH,
                contentHash: 'hash',
                publicationEpoch: 1
            }))
        )
        query.getMany.mockResolvedValue(
            ids.map((documentId) => ({
                documentId,
                sourceContentHash: 'hash',
                sourcePublicationEpoch: 1,
                revision: 2,
                status: KnowledgeGraphIndexJobStatus.SUCCESS,
                result: 'indexed'
            }))
        )
        const result = await service.getBatchProgress('kb', ids)
        expect(result.documents).toHaveLength(100)
        expect(result.documents.every((item) => item.state === 'ready')).toBe(true)
        expect(knowledgebaseService.findOneByIdString).toHaveBeenCalledTimes(1)
        expect(transaction).toHaveBeenCalledTimes(1)
        expect(documents.find).toHaveBeenCalledTimes(1)
        expect(documents.findOne).not.toHaveBeenCalled()
        expect(query.getMany).toHaveBeenCalledTimes(1)
        expect(query.distinctOn).toHaveBeenCalledWith(['job.documentId'])
        expect(query.orderBy).toHaveBeenCalledWith('job.documentId', 'ASC')
        expect(query.addOrderBy.mock.calls).toEqual([
            ['job.createdAt', 'DESC'],
            ['job.id', 'DESC']
        ])
        const scope = { knowledgebaseId: 'kb', tenantId: 'tenant', organizationId: 'org' }
        expect(documents.find).toHaveBeenCalledWith(
            expect.objectContaining({ where: { ...scope, id: expect.objectContaining({ value: ids }) } })
        )
        expect(query.where).toHaveBeenCalledWith({ ...scope, documentId: expect.objectContaining({ value: ids }) })
    })

    it('omits documents outside the authorized knowledgebase and does not query their jobs', async () => {
        const { service, documents, query } = setup()
        documents.find.mockResolvedValue([{ id: ids[0], status: KBDocumentStatusEnum.FINISH }])
        const result = await service.getBatchProgress('kb', [ids[0], ids[1], ids[0]])
        expect(result.documents.map((document) => document.documentId)).toEqual([ids[0]])
        expect(query.where).toHaveBeenCalledWith(
            expect.objectContaining({ documentId: expect.objectContaining({ value: [ids[0]] }) })
        )
    })

    it('authorizes the batch before opening a transaction', async () => {
        const { service, knowledgebaseService, transaction } = setup()
        knowledgebaseService.findOneByIdString.mockRejectedValue(new ForbiddenException())
        await expect(service.getBatchProgress('kb', ids)).rejects.toBeInstanceOf(ForbiddenException)
        expect(transaction).not.toHaveBeenCalled()
    })

    it.each([{ input: [] }, { input: [...ids, ids[0]] }, { input: ['not-a-uuid'] }, { input: null }])(
        'rejects invalid or unbounded status requests: $input',
        async ({ input }) => {
            const { service, transaction } = setup()
            await expect(service.getBatchProgress('kb', input)).rejects.toBeInstanceOf(BadRequestException)
            expect(transaction).not.toHaveBeenCalled()
        }
    )
})
