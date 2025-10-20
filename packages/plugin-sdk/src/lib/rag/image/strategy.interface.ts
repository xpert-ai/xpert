import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { IDocumentUnderstandingProvider } from '@metad/contracts'
import { Document } from '@langchain/core/documents'
import { Permissions, XpFileSystem } from '../../core/index'
import { ChunkMetadata, TDocumentAsset } from '../types'

export type TImageUnderstandingConfig = {
  stage: 'test' | 'prod'
  visionModel: BaseChatModel
  permissions?: {
    fileSystem?: XpFileSystem
  }
}

export type TImageUnderstandingInput = {
  chunks: Document<ChunkMetadata>[] // 来自 Loader 的初始文档块
  files: TDocumentAsset[] // 需要处理的图像文件
}

export type TImageUnderstandingResult = {
  chunks: Document<Partial<ChunkMetadata>>[]
  pages?: Document<Partial<ChunkMetadata>>[]
  metadata: any // 额外的元数据（例如模型名称、处理耗时）
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
  understandImages(params: TImageUnderstandingInput, config: TConfig): Promise<TImageUnderstandingResult>
}
