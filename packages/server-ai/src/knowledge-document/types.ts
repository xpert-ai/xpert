import { IDocChunkMetadata } from '@metad/contracts'
import { ChunkMetadata } from '@xpert-ai/plugin-sdk'

export const JOB_EMBEDDING_DOCUMENT = 'embedding-document'

export type TDocChunkMetadata = IDocChunkMetadata & ChunkMetadata
