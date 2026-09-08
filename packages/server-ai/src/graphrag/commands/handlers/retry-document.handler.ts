// Invariants: reserve retries using one transaction connection and document lock.
// Commit the queued job before dispatch; queue failures remain visible and retryable.
import { NotFoundException } from '@nestjs/common'
import { CommandHandler, ICommandHandler } from '@nestjs/cqrs'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Repository } from 'typeorm'
import { KnowledgeDocument } from '../../../knowledge-document/document.entity'
import { Knowledgebase } from '../../../knowledgebase/knowledgebase.entity'
import { createGraphIndexJob } from '../../graph-index-job'
import { KnowledgebaseService } from '../../../knowledgebase/knowledgebase.service'
import { projectGraphDocumentProgress } from '../../document-progress'
import { KnowledgeGraphIndexJob } from '../../entities'
import { GraphragService } from '../../graphrag.service'
import { KnowledgeGraphRetryDocumentCommand } from '../knowledge-graph-retry-document.command'

@CommandHandler(KnowledgeGraphRetryDocumentCommand)
export class KnowledgeGraphRetryDocumentHandler implements ICommandHandler<KnowledgeGraphRetryDocumentCommand> {
    constructor(
        private readonly knowledgebaseService: KnowledgebaseService,
        private readonly graph: GraphragService,
        @InjectRepository(KnowledgeGraphIndexJob)
        private readonly jobRepository: Repository<KnowledgeGraphIndexJob>
    ) {}

    async execute({ input }: KnowledgeGraphRetryDocumentCommand) {
        const knowledgebase = await this.knowledgebaseService.findOneByIdString(input.knowledgebaseId)
        const scope = {
            knowledgebaseId: knowledgebase.id,
            tenantId: knowledgebase.tenantId ?? IsNull(),
            organizationId: knowledgebase.organizationId ?? IsNull()
        }
        const jobs = await this.jobRepository.manager.transaction(async (manager) => {
            await manager.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
                JSON.stringify([
                    'graph-document-retry',
                    knowledgebase.tenantId,
                    knowledgebase.organizationId,
                    knowledgebase.id,
                    input.documentId
                ])
            ])
            const currentKb = await manager.getRepository(Knowledgebase).findOneOrFail({
                where: { id: knowledgebase.id }
            })
            const document = await manager.getRepository(KnowledgeDocument).findOne({
                where: { ...scope, id: input.documentId }
            })
            if (!document) throw new NotFoundException()
            const latest = await manager.getRepository(KnowledgeGraphIndexJob).findOne({
                where: { ...scope, documentId: document.id },
                order: { createdAt: 'DESC', id: 'DESC' }
            })
            if (!document.contentHash || projectGraphDocumentProgress(currentKb, document, latest).state !== 'failed') {
                return []
            }
            const snapshot = await manager.getRepository(KnowledgeGraphIndexJob).findOne({
                where: { id: latest.id, ...scope },
                select: { id: true, extractionId: true, extractionSnapshot: true }
            })
            return [
                await createGraphIndexJob(
                    manager.getRepository(KnowledgeGraphIndexJob),
                    manager.getRepository(Knowledgebase),
                    currentKb,
                    document,
                    {
                        knowledgebaseId: knowledgebase.id,
                        tenantId: knowledgebase.tenantId,
                        organizationId: knowledgebase.organizationId,
                        documentIds: [document.id],
                        userId: input.userId,
                        reason: 'document'
                    },
                    snapshot
                )
            ]
        })
        if (jobs.length) await this.graph.dispatchJobs(jobs, input.userId)
        return jobs
    }
}
