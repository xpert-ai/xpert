import { IDocumentChunkerProvider, KnowledgeChunkingDecision, KnowledgeStructureEnum } from '@xpert-ai/contracts'
import { DocumentInterface } from '@langchain/core/documents'
import { ChunkMetadata } from '../types'

export interface TextSplitterExecutionContext {
  /** Public parser-level token cap. Providers must not persist a second copy in their own options. */
  maxChunkTokens?: number
}

export interface TextSplitterResult {
  chunks: DocumentInterface<ChunkMetadata>[]
  decisions?: KnowledgeChunkingDecision[]
}

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
    documents: DocumentInterface[],
    options?: TConfig,
    context?: TextSplitterExecutionContext
  ): Promise<TextSplitterResult>
}
