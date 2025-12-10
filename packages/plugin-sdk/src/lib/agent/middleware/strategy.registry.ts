import { Injectable } from '@nestjs/common'
import { DiscoveryService, Reflector } from '@nestjs/core'
import { BaseStrategyRegistry } from '../../strategy'
import { AGENT_MIDDLEWARE_STRATEGY } from './strategy.decorator'
import { IAgentMiddlewareStrategy } from './strategy.interface'

@Injectable()
export class AgentMiddlewareRegistry extends BaseStrategyRegistry<IAgentMiddlewareStrategy> {
  constructor(discoveryService: DiscoveryService, reflector: Reflector) {
    super(AGENT_MIDDLEWARE_STRATEGY, discoveryService, reflector)
  }
}
