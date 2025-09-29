import { DocumentInterface } from '@langchain/core/documents'
import { IDocumentProcessorProvider } from '@metad/contracts'
import { Permissions, XpFileSystem } from '../../core/index'
import { ChunkMetadata, TDocumentAsset } from '../types'

export type TDocumentTransformerConfig = {
  stage: 'test' | 'prod'
  tempDir?: string
  permissions?: {
    fileSystem?: XpFileSystem
  }
}

export type TDocumentTransformerFile = {
  id?: string
  fileUrl: string
  filePath: string
  filename: string
  extname: string | undefined
}

export type TDocumentTransformerInput = TDocumentTransformerFile[] | string | string[]

export type TDocumentTransformerResult = {
  id?: string
  chunks: DocumentInterface<ChunkMetadata>[]
  metadata: {
    assets?: TDocumentAsset[]
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
  transformDocuments(files: TDocumentTransformerInput, config: TConfig): Promise<TDocumentTransformerResult[]>
}
