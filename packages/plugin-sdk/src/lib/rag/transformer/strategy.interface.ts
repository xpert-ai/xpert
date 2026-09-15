import { IDocumentProcessorProvider, IIntegration, IKnowledgeDocument } from '@xpert-ai/contracts'
import { Permissions, XpFileSystem } from '../../core/index'
import type { WorkspaceFileScope } from '../../runtime/capabilities/workspace-files'
import { ChunkMetadata } from '../types'

export type TDocumentTransformerConfig = {
  stage: 'test' | 'prod'
  tempDir?: string
  /** Trusted host scope for background transforms using Workspace Files and Sandbox Jobs. */
  fileScope?: WorkspaceFileScope
  permissions?: {
    fileSystem?: XpFileSystem
    integration?: IIntegration
  }
}

export interface IDocumentTransformerStrategy<TConfig extends TDocumentTransformerConfig = TDocumentTransformerConfig> {
  /**
   * Metadata about this transformer
   */
  readonly meta: IDocumentProcessorProvider

  readonly permissions: Permissions

  /**
   * Validate the configuration
   */
  validateConfig(config: TConfig): Promise<void>

  /**
   * Transform documents (e.g., extract, OCR, normalize, enrich metadata)
   */
  transformDocuments(
    files: Partial<IKnowledgeDocument>[],
    config: TConfig
  ): Promise<Partial<IKnowledgeDocument<ChunkMetadata>>[]>
}
