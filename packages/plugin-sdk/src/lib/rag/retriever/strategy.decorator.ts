import { applyDecorators, SetMetadata } from '@nestjs/common';
import { STRATEGY_META_KEY } from '../../types';

export const RETRIEVER_STRATEGY = 'RETRIEVER_STRATEGY';

/**
 * Decorator to mark a provider as a Retriever Strategy
 */
export const RetrieverStrategy = (provider: string) =>
  applyDecorators(
    SetMetadata(RETRIEVER_STRATEGY, provider),
    SetMetadata(STRATEGY_META_KEY, RETRIEVER_STRATEGY)
  );
