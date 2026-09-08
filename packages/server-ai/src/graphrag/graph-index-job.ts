import {
    IKnowledgebase,
    IKnowledgeDocument,
    KnowledgeGraphIndexJobStatus,
    KnowledgeGraphStatus
} from '@xpert-ai/contracts'
import { Repository } from 'typeorm'
import { randomUUID } from 'node:crypto'
import { Knowledgebase } from '../knowledgebase/knowledgebase.entity'
import { KnowledgeGraphIndexJob } from './entities'
import { TKnowledgeGraphEnqueueInput } from './types'

// Retry callers supply transaction-scoped repositories; queue dispatch happens after commit.
export async function createGraphIndexJob(
    jobs: Repository<KnowledgeGraphIndexJob>,
    knowledgebases: Repository<Knowledgebase>,
    knowledgebase: Pick<IKnowledgebase, 'id' | 'tenantId' | 'organizationId' | 'graphRevision'>,
    source: Pick<IKnowledgeDocument, 'id' | 'contentHash' | 'publicationEpoch'>,
    input: TKnowledgeGraphEnqueueInput,
    resume?: Pick<KnowledgeGraphIndexJob, 'extractionId' | 'extractionSnapshot'>
) {
    await knowledgebases.update(knowledgebase.id, {
        graphStatus: KnowledgeGraphStatus.INDEXING,
        graphIndexError: null
    })
    return jobs.save(
        jobs.create({
            tenantId: input.tenantId ?? knowledgebase.tenantId,
            organizationId: input.organizationId ?? knowledgebase.organizationId,
            knowledgebaseId: knowledgebase.id,
            documentId: source.id,
            sourceContentHash: source.contentHash,
            sourcePublicationEpoch: source.publicationEpoch ?? 0,
            extractionId: resume?.extractionId ?? randomUUID(),
            extractionSnapshot: resume?.extractionSnapshot ?? null,
            type: input.reason,
            status: KnowledgeGraphIndexJobStatus.QUEUED,
            revision: knowledgebase.graphRevision ?? 0,
            processedChunks: 0,
            totalChunks: 0
        })
    )
}
