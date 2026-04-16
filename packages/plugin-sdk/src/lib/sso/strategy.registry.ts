import { Injectable } from '@nestjs/common'
import { DiscoveryService, Reflector } from '@nestjs/core'
import { BaseStrategyRegistry } from '../strategy'
import { SSO_PROVIDER } from './strategy.decorator'
import { ISSOProviderStrategy } from './strategy.interface'

@Injectable()
export class SSOProviderRegistry extends BaseStrategyRegistry<ISSOProviderStrategy> {
  constructor(discoveryService: DiscoveryService, reflector: Reflector) {
    super(SSO_PROVIDER, discoveryService, reflector)
  }
}
