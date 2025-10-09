import { SetMetadata } from '@nestjs/common';

export const RETRIEVER_STRATEGY = 'RETRIEVER_STRATEGY';

/**
 * Decorator to mark a provider as a Retriever Strategy
 */
export const RetrieverStrategy = (provider: string) =>
  SetMetadata(RETRIEVER_STRATEGY, provider);
