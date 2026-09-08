import {
    KNOWLEDGE_GRAPH_DOCUMENT_STATUS_BATCH_SIZE,
    KnowledgeGraphDocumentProgress,
    KnowledgeGraphDocumentsProgressResponse
} from '@xpert-ai/contracts'
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, IsNull, Repository } from 'typeorm'
import { isUUID } from 'class-validator'
import { t } from 'i18next'
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

    async getBatchProgress(
        knowledgebaseId: string,
        documentIds: unknown
    ): Promise<KnowledgeGraphDocumentsProgressResponse> {
        if (
            !Array.isArray(documentIds) ||
            !documentIds.length ||
            documentIds.length > KNOWLEDGE_GRAPH_DOCUMENT_STATUS_BATCH_SIZE ||
            !documentIds.every((id): id is string => typeof id === 'string' && isUUID(id, 'all'))
        ) {
            throw new BadRequestException(
                t('server-ai:Error.KnowledgeGraphDocumentStatusBatchInvalid', {
                    max: KNOWLEDGE_GRAPH_DOCUMENT_STATUS_BATCH_SIZE,
                    defaultValue: 'Provide between 1 and {{max}} document UUIDs.'
                })
            )
        }
        const knowledgebase = await this.knowledgebaseService.findOneByIdString(knowledgebaseId)
        const scope = {
            knowledgebaseId,
            tenantId: knowledgebase.tenantId ?? IsNull(),
            organizationId: knowledgebase.organizationId ?? IsNull()
        }
        return this.jobRepository.manager.transaction('REPEATABLE READ', async (manager) => {
            const documents = await manager.getRepository(KnowledgeDocument).find({
                where: { ...scope, id: In([...new Set(documentIds)]) },
                select: {
                    id: true,
                    status: true,
                    disabled: true,
                    contentHash: true,
                    publicationEpoch: true,
                    hardDeletePendingAt: true
                }
            })
            if (!documents.length) return { documents: [] }
            // Select the latest job per authorized document in SQL, without loading job history.
            const jobs = await manager
                .getRepository(KnowledgeGraphIndexJob)
                .createQueryBuilder('job')
                .distinctOn(['job.documentId'])
                .where({ ...scope, documentId: In(documents.map(({ id }) => id)) })
                .orderBy('job.documentId', 'ASC')
                .addOrderBy('job.createdAt', 'DESC')
                .addOrderBy('job.id', 'DESC')
                .getMany()
            const latestJobs = new Map(jobs.map((job) => [job.documentId, job]))
            return {
                documents: documents.map((document) =>
                    projectGraphDocumentProgress(knowledgebase, document, latestJobs.get(document.id) ?? null)
                )
            }
        })
    }

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
