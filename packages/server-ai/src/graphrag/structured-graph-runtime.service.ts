// Invariants: only the managed document owner can publish. Reserve a complete snapshot under
// the KB/source locks; dispatch after commit. Retrying a structured publication never invokes a model.
import { ForbiddenException, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import {
    KnowledgeGraphRuntimeCapability,
    KnowledgeGraphApi,
    KnowledgeGraphPublishInput,
    KnowledgeGraphPublicationOwner,
    KnowledgeGraphPublicationResult
} from '@xpert-ai/plugin-sdk'
import { KnowledgeGraphIndexJobStatus } from '@xpert-ai/contracts'
import { KnowledgeDocument } from '../knowledge-document/document.entity'
import { KnowledgeDocumentChunk } from '../knowledge-document/chunk/chunk.entity'
import { KnowledgeDocumentService } from '../knowledge-document/document.service'
import { KnowledgebaseService } from '../knowledgebase/knowledgebase.service'
import { Knowledgebase } from '../knowledgebase/knowledgebase.entity'
import { RuntimeCapabilityProvider } from '../shared/runtime/runtime-capability-provider.decorator'
import { KnowledgeGraphIndexJob } from './entities'
import { createGraphIndexJob } from './graph-index-job'
import { GraphragService } from './graphrag.service'
import { parseGraphExtractionSnapshot } from './graph-extraction-model'
import { invalidGraphPublication, parseGraphPublication, toStructuredExtraction } from './structured-graph-model'
import { BoundedGraphReader } from './bounded-graph-reader'
import type { KnowledgeGraphEntityQuery, KnowledgeGraphNeighborhoodQuery } from '@xpert-ai/plugin-sdk'

@Injectable()
@RuntimeCapabilityProvider(KnowledgeGraphRuntimeCapability)
export class StructuredGraphRuntimeService implements KnowledgeGraphApi {
    queryEntities(input: KnowledgeGraphEntityQuery) {
        return new BoundedGraphReader(this.jobs.manager, this.knowledgebases).query(input)
    }
    readNeighborhood(input: KnowledgeGraphNeighborhoodQuery) {
        return new BoundedGraphReader(this.jobs.manager, this.knowledgebases).neighborhood(input)
    }
    constructor(
        private readonly documents: KnowledgeDocumentService,
        private readonly knowledgebases: KnowledgebaseService,
        private readonly graph: GraphragService,
        @InjectRepository(KnowledgeGraphIndexJob) private readonly jobs: Repository<KnowledgeGraphIndexJob>
    ) {}

    private async authorize(input: KnowledgeGraphPublicationOwner) {
        await this.documents.assertDocumentReadAccess(input.documentId)
        const kb = await this.knowledgebases.assertKnowledgebaseWriteAccess(input.knowledgebaseId)
        const document = await this.documents.findOne(input.documentId)
        if (
            document.knowledgebaseId !== kb.id ||
            document.metadata?.systemManagedType !== 'agent-writer' ||
            document.metadata.ownerXpertId !== input.xpertId ||
            document.metadata.ownerAgentKey !== input.agentKey
        ) {
            throw new ForbiddenException()
        }
        return kb
    }

    async publish(value: KnowledgeGraphPublishInput): Promise<KnowledgeGraphPublicationResult> {
        const input = parseGraphPublication(value)
        const kb = await this.authorize(input)
        if (!kb.graphRag?.enabled) invalidGraphPublication()
        const snapshot = toStructuredExtraction(input)
        const reserved = await this.jobs.manager.transaction(async (manager) => {
            const currentKb = await manager.getRepository(Knowledgebase).findOneOrFail({
                where: { id: kb.id },
                lock: { mode: 'pessimistic_write' }
            })
            const source = await manager.getRepository(KnowledgeDocument).findOneOrFail({
                where: { id: input.documentId, knowledgebaseId: kb.id },
                lock: { mode: 'pessimistic_write' }
            })
            if (!currentKb.graphRag?.enabled || !source.contentHash || source.disabled || source.hardDeletePendingAt)
                invalidGraphPublication()
            const chunks = await manager.getRepository(KnowledgeDocumentChunk).find({
                where: { documentId: source.id, knowledgebaseId: kb.id },
                select: { id: true, metadata: true }
            })
            const expected = new Set(input.chunkIds)
            if (chunks.length !== expected.size || chunks.some((c) => !expected.has(c.metadata?.chunkId ?? c.id)))
                invalidGraphPublication()
            const latest = await manager.getRepository(KnowledgeGraphIndexJob).findOne({
                where: { knowledgebaseId: kb.id, documentId: source.id },
                order: { createdAt: 'DESC', id: 'DESC' },
                select: {
                    id: true,
                    documentId: true,
                    error: true,
                    status: true,
                    extractionSnapshot: true,
                    sourceContentHash: true,
                    sourcePublicationEpoch: true
                }
            })
            if (
                latest?.extractionSnapshot?.publication?.hash === snapshot.publication.hash &&
                latest.sourceContentHash === source.contentHash &&
                latest.sourcePublicationEpoch === source.publicationEpoch &&
                latest.status !== KnowledgeGraphIndexJobStatus.FAILED
            )
                return { job: latest, unchanged: true }
            const job = await createGraphIndexJob(
                manager.getRepository(KnowledgeGraphIndexJob),
                manager.getRepository(Knowledgebase),
                currentKb,
                source,
                { knowledgebaseId: kb.id, documentIds: [source.id], reason: 'document' },
                { extractionSnapshot: snapshot }
            )
            await manager
                .getRepository(KnowledgeDocument)
                .createQueryBuilder()
                .update()
                .set({
                    metadata: () => ':metadata'
                })
                .where('id = :id', { id: source.id })
                .setParameter(
                    'metadata',
                    JSON.stringify({
                        ...source.metadata,
                        graphSource: { mode: 'structured', publicationJobId: job.id }
                    })
                )
                .execute()
            await manager
                .getRepository(KnowledgeGraphIndexJob)
                .createQueryBuilder()
                .update()
                .set({
                    status: KnowledgeGraphIndexJobStatus.SUCCESS,
                    result: 'superseded',
                    completedAt: new Date()
                })
                .where('"documentId" = :id AND "knowledgebaseId" = :kb AND id <> :job', {
                    id: source.id,
                    kb: kb.id,
                    job: job.id
                })
                .andWhere({ status: In([KnowledgeGraphIndexJobStatus.QUEUED, KnowledgeGraphIndexJobStatus.RUNNING]) })
                .execute()
            return { job, unchanged: false }
        })
        if (!reserved.unchanged) await this.graph.dispatchJobs([reserved.job])
        return this.result(reserved.job, reserved.unchanged)
    }

    async status(input: KnowledgeGraphPublicationOwner): Promise<KnowledgeGraphPublicationResult | null> {
        await this.authorize(input)
        const job = await this.jobs.findOne({
            where: { knowledgebaseId: input.knowledgebaseId, documentId: input.documentId },
            order: { createdAt: 'DESC', id: 'DESC' },
            select: { id: true, documentId: true, status: true, error: true, extractionSnapshot: true }
        })
        return job?.extractionSnapshot?.publication ? this.result(job, false) : null
    }

    retract(
        input: KnowledgeGraphPublicationOwner & { publicationKey: string; sourceVersion: string; chunkIds: string[] }
    ) {
        return this.publish({ ...input, entities: [], relations: [] })
    }

    private result(job: KnowledgeGraphIndexJob, unchanged: boolean): KnowledgeGraphPublicationResult {
        const snapshot = parseGraphExtractionSnapshot(job.extractionSnapshot)
        if (!snapshot.publication) invalidGraphPublication()
        return {
            documentId: job.documentId,
            publicationId: job.id,
            publicationKey: snapshot.publication.key,
            sourceVersion: snapshot.publication.sourceVersion,
            contentHash: snapshot.publication.hash,
            status: job.status,
            entityCount: snapshot.entities.length,
            relationCount: snapshot.relations.length,
            unchanged,
            error: job.error
        }
    }
}
