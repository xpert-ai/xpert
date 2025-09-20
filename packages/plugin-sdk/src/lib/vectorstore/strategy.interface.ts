import { EmbeddingsInterface } from '@langchain/core/embeddings'
import { VectorStore } from '@langchain/core/vectorstores'

/**
 * Interface for VectorStore strategy。
 * 
 * 
 */
export interface IVectorStoreStrategy<TConfig extends {collectionName?: string}> {
  /**
   * Metadata about the strategy
   */
  readonly name: string;
  readonly description?: string;

  /**
   * Validate configuration for VectorStore
   */
  validateConfig(config: TConfig): Promise<void>;

  /**
   * Create a VectorStore with given config
   */
  createStore(embeddings: EmbeddingsInterface, config: TConfig): Promise<VectorStore>;
}
