import { applyDecorators, SetMetadata } from '@nestjs/common';
import { STRATEGY_META_KEY } from '../../types';

export const DOCUMENT_TRANSFORMER_STRATEGY = 'DOCUMENT_TRANSFORMER_STRATEGY';

/**
 * Decorator to mark a provider as a Document Transformer Strategy
 */
export const DocumentTransformerStrategy = (provider: string) =>
  applyDecorators(
    SetMetadata(DOCUMENT_TRANSFORMER_STRATEGY, provider),
    SetMetadata(STRATEGY_META_KEY, DOCUMENT_TRANSFORMER_STRATEGY)
  );
