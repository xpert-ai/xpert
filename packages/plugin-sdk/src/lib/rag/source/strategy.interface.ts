import { IDocumentSourceProvider } from '@metad/contracts';
import { Document } from 'langchain/document';

export interface IDocumentSourceStrategy<TConfig = any> {
  /**
   * Metadata about this document source
   */
  readonly meta: IDocumentSourceProvider

  /**
   * Validate the configuration
   */
  validateConfig(config: TConfig): Promise<void>;

  /**
   * Test the connection to the source
   * 
   * @param config 
   */
  test(config: TConfig): Promise<any>;

  /**
   * Load documents from the source
   */
  loadDocuments(config: TConfig): Promise<Document[]>;
}
