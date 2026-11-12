import { IKnowledgeDocumentChunk } from '@xpert-ai/contracts'
import { TDocChunkMetadata } from '../types'

export function getChunkMetadata(
    chunk: Pick<IKnowledgeDocumentChunk<TDocChunkMetadata>, 'metadata'> | null | undefined
) {
    return chunk?.metadata ?? ({} as TDocChunkMetadata)
}

export function getChunkLogicalId(chunk: Pick<IKnowledgeDocumentChunk<TDocChunkMetadata>, 'id' | 'metadata'>) {
    return getChunkMetadata(chunk).chunkId || chunk.id
}
