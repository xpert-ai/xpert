import { applyDecorators, SetMetadata } from '@nestjs/common';
import { STRATEGY_META_KEY } from '../types';

export const TOOLSET_STRATEGY = 'TOOLSET_STRATEGY';

/**
 * Decorator to mark a provider as a Toolset Strategy
 */
export const ToolsetStrategy = (provider: string) =>
  applyDecorators(
    SetMetadata(TOOLSET_STRATEGY, provider),
    SetMetadata(STRATEGY_META_KEY, TOOLSET_STRATEGY)
  );