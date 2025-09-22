import { I18nObject, KnowledgeChunkStructureEnum } from '@metad/contracts'
import { Document } from 'langchain/document'
import { ChunkMetadata } from '../types'

/**
 * Split text content into chunks for embedding and retrieval
 */
export interface ITextSplitterStrategy<TConfig = any> {
  /**
   * Metadata about this splitter
   */
  readonly meta: {
    name: string
    label: I18nObject
    configSchema: any
    icon: {
      svg: string
      color: string
    }
  }

  readonly chunkStructure: KnowledgeChunkStructureEnum

  /**
   * Validate the configuration
   */
  validateConfig(config: TConfig): Promise<void>

  /**
   * Split a text into chunks and pages (if applicable)
   */
  splitDocuments(
    documents: Document[],
    options?: TConfig
  ): Promise<{ chunks: Document<ChunkMetadata>[]; pages?: Document<ChunkMetadata>[] }>
}
