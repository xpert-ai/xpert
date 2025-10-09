import { SetMetadata } from '@nestjs/common';

export const IMAGE_UNDERSTANDING_STRATEGY = 'IMAGE_UNDERSTANDING_STRATEGY';

/**
 * Decorator to mark a provider as an Image Understanding Strategy
 */
export const ImageUnderstandingStrategy = (provider: string) =>
  SetMetadata(IMAGE_UNDERSTANDING_STRATEGY, provider);
