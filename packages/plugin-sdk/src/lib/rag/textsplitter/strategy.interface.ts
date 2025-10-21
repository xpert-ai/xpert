import { IDocumentChunkerProvider, KnowledgeStructureEnum } from '@metad/contracts'
import { Document } from '@langchain/core/documents'
import { ChunkMetadata } from '../types'

/**
 * Split text content into chunks for embedding and retrieval
 */
export interface ITextSplitterStrategy<TConfig = any> {
  /**
   * Metadata about this splitter
   */
  readonly meta: IDocumentChunkerProvider

  readonly structure: KnowledgeStructureEnum

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
