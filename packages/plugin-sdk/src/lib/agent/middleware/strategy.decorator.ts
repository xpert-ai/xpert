import { applyDecorators, SetMetadata } from '@nestjs/common'
import { STRATEGY_META_KEY } from '../../types';

export const AGENT_MIDDLEWARE_STRATEGY = 'AGENT_MIDDLEWARE_STRATEGY'

export const AgentMiddlewareStrategy = (provider: string) =>
  applyDecorators(
      SetMetadata(AGENT_MIDDLEWARE_STRATEGY, provider),
      SetMetadata(STRATEGY_META_KEY, AGENT_MIDDLEWARE_STRATEGY),
    );
