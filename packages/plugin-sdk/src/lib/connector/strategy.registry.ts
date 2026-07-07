import { Injectable } from '@nestjs/common'
import { DiscoveryService, Reflector } from '@nestjs/core'
import { BaseStrategyRegistry } from '../strategy'
import { CONNECTOR_STRATEGY } from './strategy.decorator'
import type { ConnectorStrategy } from './strategy.interface'

@Injectable()
export class ConnectorStrategyRegistry extends BaseStrategyRegistry<ConnectorStrategy> {
  constructor(discoveryService: DiscoveryService, reflector: Reflector) {
    super(CONNECTOR_STRATEGY, discoveryService, reflector)
  }
}
