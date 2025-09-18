import { I18nObject } from '@metad/contracts';
import { Document } from 'langchain/document';

export interface IDocumentTransformerStrategy<TConfig = any> {
  /**
   * Metadata about this transformer
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
   * Transform documents (e.g., extract, OCR, normalize, enrich metadata)
   */
  transformDocuments(files: string[], config: TConfig): Promise<{chunks: Document[]; metadata: any}>;
}
