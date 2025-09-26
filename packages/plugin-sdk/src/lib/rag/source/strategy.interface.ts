import { IDocumentSourceProvider, IIntegration } from '@metad/contracts';
import { Document } from 'langchain/document';
import { Permissions } from '../../core';

export interface IDocumentSourceStrategy<TConfig = any> {
  readonly permissions: Permissions
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
  loadDocuments(config: TConfig, context?: {integration: IIntegration}): Promise<Document[]>;
}
