import type { IKnowledgeDocument } from '@xpert-ai/contracts'
import type { Repository } from 'typeorm'
import { KnowledgeGraphIndexJob } from './entities'

type Source = Pick<IKnowledgeDocument, 'id' | 'contentHash' | 'publicationEpoch' | 'metadata'>
export function isStructuredGraphDocument(source: Pick<Source, 'metadata'>) {
    const value: unknown = source.metadata?.graphSource
    return typeof value === 'object' && value !== null && 'mode' in value && value.mode === 'structured'
}

/** A rebuild resumes the publisher snapshot only while its complete source version is current. */
export async function structuredGraphResume(jobs: Repository<KnowledgeGraphIndexJob>, source: Source) {
    if (!isStructuredGraphDocument(source)) return undefined
    const value: unknown = source.metadata?.graphSource
    if (
        typeof value !== 'object' ||
        value === null ||
        !('publicationJobId' in value) ||
        typeof value.publicationJobId !== 'string'
    )
        return undefined
    const job = await jobs.findOne({
        where: { id: value.publicationJobId, documentId: source.id },
        select: {
            id: true,
            extractionId: true,
            extractionSnapshot: true,
            sourceContentHash: true,
            sourcePublicationEpoch: true
        }
    })
    return job?.extractionSnapshot?.publication &&
        job.sourceContentHash === source.contentHash &&
        job.sourcePublicationEpoch === source.publicationEpoch
        ? job
        : undefined
}
