import { IDocumentProcessorProvider } from '@metad/contracts'
import { Document } from 'langchain/document'
import { Permissions, XpFileSystem } from '../../core/index'
import { TDocumentAsset } from '../types'

export type TDocumentTransformerConfig = {
  stage: 'test' | 'prod'
  tempDir?: string
  permissions?: {
    fileSystem?: XpFileSystem
  }
}

export type TDocumentTransformerFile = {
  url: string
  filename: string
  extname: string | undefined
}

export type TDocumentTransformerInput = TDocumentTransformerFile[] | string | string[]

export type TDocumentTransformerResult = {
  chunks: Document[]
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
