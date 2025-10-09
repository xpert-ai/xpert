import { Injectable } from '@nestjs/common'
import { DiscoveryService, Reflector } from '@nestjs/core'
import { BaseStrategyRegistry } from '../strategy'
import { INTEGRATION_STRATEGY } from './strategy.decorator'
import { IntegrationStrategy } from './strategy.interface'

@Injectable()
export class IntegrationStrategyRegistry extends BaseStrategyRegistry<IntegrationStrategy> {
  constructor(discoveryService: DiscoveryService, reflector: Reflector) {
    super(INTEGRATION_STRATEGY, discoveryService, reflector)
  }
}
