import { SetMetadata } from '@nestjs/common';

export const DOCUMENT_TRANSFORMER_STRATEGY = 'DOCUMENT_TRANSFORMER_STRATEGY';

/**
 * Decorator to mark a provider as a Document Transformer Strategy
 */
export const DocumentTransformerStrategy = (provider: string) =>
  SetMetadata(DOCUMENT_TRANSFORMER_STRATEGY, provider);
