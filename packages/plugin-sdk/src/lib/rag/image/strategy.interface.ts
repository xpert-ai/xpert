import { DocumentInterface } from '@langchain/core/documents'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { IDocumentUnderstandingProvider, IKnowledgeDocument } from '@metad/contracts'
import { Permissions, XpFileSystem } from '../../core/index'
import { ChunkMetadata } from '../types'

export type TImageUnderstandingConfig = {
  stage: 'test' | 'prod'
  visionModel: BaseChatModel
  permissions?: {
    fileSystem?: XpFileSystem
  }
}

export type TImageUnderstandingResult = {
  chunks: DocumentInterface<Partial<ChunkMetadata>>[]
  // pages?: Document<Partial<ChunkMetadata>>[]
  metadata: any // Additional metadata (e.g. model name, processing time)
}

export interface IImageUnderstandingStrategy<TConfig extends TImageUnderstandingConfig = TImageUnderstandingConfig> {
  readonly permissions: Permissions
  /**
   * Metadata about this strategy
   */
  readonly meta: IDocumentUnderstandingProvider

  /**
   * Validate the configuration
   */
  validateConfig(config: TConfig): Promise<void>

  /**
   * Understand image files (e.g., OCR, VLM, Chart Parsing)
   */
  understandImages(doc: IKnowledgeDocument<ChunkMetadata>, config: TConfig): Promise<TImageUnderstandingResult>
}
