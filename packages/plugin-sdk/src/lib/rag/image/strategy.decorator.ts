import { applyDecorators, SetMetadata } from '@nestjs/common';
import { STRATEGY_META_KEY } from '../../types';

export const IMAGE_UNDERSTANDING_STRATEGY = 'IMAGE_UNDERSTANDING_STRATEGY';

/**
 * Decorator to mark a provider as an Image Understanding Strategy
 */
export const ImageUnderstandingStrategy = (provider: string) =>
    applyDecorators(
        SetMetadata(IMAGE_UNDERSTANDING_STRATEGY, provider),
        SetMetadata(STRATEGY_META_KEY, IMAGE_UNDERSTANDING_STRATEGY),
      );
