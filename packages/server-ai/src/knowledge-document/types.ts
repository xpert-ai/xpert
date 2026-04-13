import { IDocChunkMetadata } from '@xpert-ai/contracts'
import { ChunkMetadata } from '@xpert-ai/plugin-sdk'

export const JOB_EMBEDDING_DOCUMENT = 'embedding-document'

export type TDocChunkMetadata = IDocChunkMetadata & ChunkMetadata
