import { KnowledgeGraphDocumentProgress } from '@xpert-ai/contracts'
import { Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Repository } from 'typeorm'
import { KnowledgeDocument } from '../knowledge-document/document.entity'
import { KnowledgebaseService } from '../knowledgebase/knowledgebase.service'
import { KnowledgeGraphIndexJob } from './entities/knowledge-graph-index-job.entity'
import { projectGraphDocumentProgress } from './document-progress'

@Injectable()
export class GraphDocumentProgressService {
    constructor(
        private readonly knowledgebaseService: KnowledgebaseService,
        @InjectRepository(KnowledgeGraphIndexJob)
        private readonly jobRepository: Repository<KnowledgeGraphIndexJob>
    ) {}

    async getProgress(knowledgebaseId: string, documentId: string): Promise<KnowledgeGraphDocumentProgress> {
        const knowledgebase = await this.knowledgebaseService.findOneByIdString(knowledgebaseId)
        const scope = {
            knowledgebaseId,
            tenantId: knowledgebase.tenantId ?? IsNull(),
            organizationId: knowledgebase.organizationId ?? IsNull()
        }
        return this.jobRepository.manager.transaction('REPEATABLE READ', async (manager) => {
            const document = await manager.getRepository(KnowledgeDocument).findOne({
                where: { ...scope, id: documentId },
                select: {
                    id: true,
                    status: true,
                    disabled: true,
                    contentHash: true,
                    publicationEpoch: true,
                    hardDeletePendingAt: true
                }
            })
            if (!document) throw new NotFoundException()
            const job = await manager.getRepository(KnowledgeGraphIndexJob).findOne({
                where: { ...scope, documentId },
                order: { createdAt: 'DESC', id: 'DESC' }
            })
            return projectGraphDocumentProgress(knowledgebase, document, job)
        })
    }
}
