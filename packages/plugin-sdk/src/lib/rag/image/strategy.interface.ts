import { DocumentInterface } from '@langchain/core/documents'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { IDocumentUnderstandingProvider, IKnowledgeDocument } from '@xpert-ai/contracts'
import type { JSONValue } from '@xpert-ai/contracts'
import { Permissions, XpFileSystem } from '../../core/index'
import { ChunkMetadata } from '../types'

export type TImageUnderstandingConfig = {
  stage: 'test' | 'prod'
  /**
   * Host-resolved vision model. Strategies that declare that the current
   * configuration does not need vision may receive no model.
   */
  visionModel?: BaseChatModel
  permissions?: {
    fileSystem?: XpFileSystem
  }
}

export type TImageUnderstandingMetadata = {
  /**
   * Optional, JSON-safe metadata merged into the owning Knowledge document.
   *
   * Strategies must not place raw file bytes, vectors, credentials, or
   * unrestricted OCR transcripts here. The host persists this value only at
   * the document boundary so downstream plugins can inspect processing
   * outcomes without parsing retrieval chunks.
   */
  documentMetadata?: Record<string, JSONValue>
  /** Provider-specific, non-persistent warnings consumed by the host. */
  warnings?: unknown
  [key: string]: unknown
}

export type TImageUnderstandingResult = {
  chunks: DocumentInterface<Partial<ChunkMetadata>>[]
  // pages?: Document<Partial<ChunkMetadata>>[]
  metadata?: TImageUnderstandingMetadata
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
   * Declares whether this invocation needs the host to resolve a vision model.
   *
   * The default is `true` for backwards compatibility. This hook is evaluated
   * before model resolution so strategies can support deterministic branches,
   * such as rebuilding retrieval text from trusted user-provided metadata,
   * without depending on model availability.
   */
  requiresVisionModel?(config: Readonly<Partial<TConfig>>): boolean | Promise<boolean>

  /**
   * Understand image files (e.g., OCR, VLM, Chart Parsing)
   */
  understandImages(doc: IKnowledgeDocument, config: TConfig): Promise<TImageUnderstandingResult>
}
