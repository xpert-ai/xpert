import { SetMetadata } from '@nestjs/common';

export const DOCUMENT_SOURCE_STRATEGY = 'DOCUMENT_SOURCE_STRATEGY';

/**
 * Decorator to mark a provider as a Document Source Strategy
 */
export const DocumentSourceStrategy = (provider: string) =>
  SetMetadata(DOCUMENT_SOURCE_STRATEGY, provider);
