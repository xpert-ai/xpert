import { IDocChunkMetadata, IKnowledgeDocumentChunk, KnowledgeChunkQuestions } from '@xpert-ai/contracts'
import { Raw, Repository } from 'typeorm'
import { KnowledgeDocumentChunk } from '../chunk/chunk.entity'

/** Fence both source edits and competing generations without changing the user's source-edit version. */
export async function writeQuestionState(
    repository: Repository<KnowledgeDocumentChunk>,
    chunk: IKnowledgeDocumentChunk<IDocChunkMetadata>,
    state: KnowledgeChunkQuestions | undefined
) {
    const metadata = { ...chunk.metadata }
    if (state) metadata.questionGeneration = structuredClone(state)
    else delete metadata.questionGeneration
    const result = await repository.update(
        {
            id: chunk.id,
            documentId: chunk.documentId,
            tenantId: chunk.tenantId,
            version: chunk.version,
            metadata: Raw(
                (alias) => `${alias} -> 'questionGeneration' IS NOT DISTINCT FROM CAST(:questionState AS jsonb)`,
                {
                    questionState: chunk.metadata?.questionGeneration
                        ? JSON.stringify(chunk.metadata.questionGeneration)
                        : null
                }
            )
        },
        { metadata, version: chunk.version }
    )
    if (!result.affected) return false
    chunk.metadata = metadata
    return true
}
