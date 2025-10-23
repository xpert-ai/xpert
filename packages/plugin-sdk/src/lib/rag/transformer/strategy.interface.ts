import { IDocumentProcessorProvider, IIntegration, IKnowledgeDocument } from '@metad/contracts'
import { Permissions, XpFileSystem } from '../../core/index'
import { ChunkMetadata } from '../types'

export type TDocumentTransformerConfig = {
  stage: 'test' | 'prod'
  tempDir?: string
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
