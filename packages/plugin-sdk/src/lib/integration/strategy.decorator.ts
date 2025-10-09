import { SetMetadata } from '@nestjs/common';

export const INTEGRATION_STRATEGY = 'INTEGRATION_STRATEGY';

export const IntegrationStrategyKey = (provider: string) =>
  SetMetadata(INTEGRATION_STRATEGY, provider);