import { SetMetadata } from '@nestjs/common'

export const AGENT_MIDDLEWARE_STRATEGY = 'AGENT_MIDDLEWARE_STRATEGY'

export const AgentMiddlewareStrategy = (provider: string) =>
  SetMetadata(AGENT_MIDDLEWARE_STRATEGY, provider)
