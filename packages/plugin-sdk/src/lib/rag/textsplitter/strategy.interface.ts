import { I18nObject } from '@metad/contracts';
import { Document } from 'langchain/document'


export interface ITextSplitterStrategy<TConfig = any> {
  /**
   * Metadata about this splitter
   */
  readonly meta: {
    name: string
    label: I18nObject
    configSchema: any
    icon: {
      svg: string
      color: string
    }
  }

  /**
   * Validate the configuration
   */
  validateConfig(config: TConfig): Promise<void>;

  /**
   * Split a text into chunks
   */
  splitDocuments(documents: Document[], options?: TConfig): Promise<Document[]>
}
