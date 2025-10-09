import { SetMetadata } from '@nestjs/common';

export const TOOLSET_STRATEGY = 'TOOLSET_STRATEGY';

/**
 * Decorator to mark a provider as a Toolset Strategy
 */
export const ToolsetStrategy = (provider: string) =>
  SetMetadata(TOOLSET_STRATEGY, provider);
