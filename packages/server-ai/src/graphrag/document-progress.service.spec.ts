import { ForbiddenException, NotFoundException } from '@nestjs/common'
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
        const manager = {
            getRepository: jest.fn((entity: unknown) => (entity === KnowledgeDocument ? documents : jobs))
        }
        const transaction = jest.fn(
            async (_isolation: string, callback: (manager: EntityManager) => Promise<unknown>) =>
                callback(manager as unknown as EntityManager)
        )
        const service = new GraphDocumentProgressService(
            knowledgebaseService as unknown as KnowledgebaseService,
            { manager: { transaction } } as unknown as Repository<KnowledgeGraphIndexJob>
        )
        return { service, knowledgebaseService, documents, jobs, transaction }
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
})
