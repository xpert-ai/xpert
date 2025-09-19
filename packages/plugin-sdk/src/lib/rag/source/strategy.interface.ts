import { I18nObject } from '@metad/contracts';
import { Document } from 'langchain/document';

export interface IDocumentSourceStrategy<TConfig = any> {
  /**
   * Metadata about this document source
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
