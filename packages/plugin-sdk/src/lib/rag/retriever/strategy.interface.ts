import { VectorStore } from '@langchain/core/vectorstores'
import { I18nObject } from '@metad/contracts'
import { Document } from '@langchain/core/documents'

export type TRetrieverConfig = {
  vectorStore: VectorStore
}

export interface IRetrieverStrategy<TConfig extends TRetrieverConfig = TRetrieverConfig> {
  /**
   * Metadata about this retriever
   */
  readonly meta: {
    name: string
    label: I18nObject
    configSchema: any
    icon: {
      svg?: string
      color?: string
    }
  }

  /**
   * Validate the configuration
   */
  validateConfig(config: TConfig): Promise<void>;

  /**
   * Retrieve relevant documents for a given query
   */
  retrieve(query: string, options?: TConfig): Promise<{ documents: Document[] }>;
}
