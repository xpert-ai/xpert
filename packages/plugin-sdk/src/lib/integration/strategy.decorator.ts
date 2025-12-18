import { applyDecorators, SetMetadata } from '@nestjs/common';
import { STRATEGY_META_KEY } from '../types';

export const INTEGRATION_STRATEGY = 'INTEGRATION_STRATEGY';

export const IntegrationStrategyKey = (provider: string) =>
  applyDecorators(
    SetMetadata(INTEGRATION_STRATEGY, provider),
    SetMetadata(STRATEGY_META_KEY, INTEGRATION_STRATEGY),
  );