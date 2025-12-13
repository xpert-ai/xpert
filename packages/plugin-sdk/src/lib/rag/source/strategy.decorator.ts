import { applyDecorators, SetMetadata } from '@nestjs/common';
import { STRATEGY_META_KEY } from '../../types';

export const DOCUMENT_SOURCE_STRATEGY = 'DOCUMENT_SOURCE_STRATEGY';

/**
 * Decorator to mark a provider as a Document Source Strategy
 */
export const DocumentSourceStrategy = (provider: string) =>
  applyDecorators(
    SetMetadata(DOCUMENT_SOURCE_STRATEGY, provider),
    SetMetadata(STRATEGY_META_KEY, DOCUMENT_SOURCE_STRATEGY)
  );
