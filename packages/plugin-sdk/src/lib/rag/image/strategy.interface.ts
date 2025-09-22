import { I18nObject } from '@metad/contracts';
import { Document } from 'langchain/document';
import { BaseChatModel } from '@langchain/core/language_models/chat_models'

export type TImageUnderstandingConfig = {
  chatModel: BaseChatModel
}

export type TImageUnderstandingFile = {
  path: string;       // 本地文件路径或远程URL
  filename: string;   // 原始文件名
  extname: string;    // 文件扩展名
  parentChunkId?: string; // 父文档块ID（来自 Loader）
};

export type TImageUnderstandingResult = {
  docs: Document[];   // OCR / VLM 生成的文档块
  metadata: any;      // 额外的元数据（例如模型名称、处理耗时）
};

export interface IImageUnderstandingStrategy<TConfig extends TImageUnderstandingConfig = TImageUnderstandingConfig> {
  /**
   * Metadata about this strategy
   */
  readonly meta: {
    name: string;
    label: I18nObject;
    configSchema: any;
    icon: {
      svg: string;
      color: string;
    };
  };

  /**
   * Validate the configuration
   */
  validateConfig(config: TConfig): Promise<void>;

  /**
   * Understand image files (e.g., OCR, VLM, Chart Parsing)
   */
  understandImages(
    files: TImageUnderstandingFile[],
    config: TConfig
  ): Promise<TImageUnderstandingResult[]>;
}
