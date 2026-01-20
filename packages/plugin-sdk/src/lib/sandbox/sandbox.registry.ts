import { Injectable } from '@nestjs/common'
import { DiscoveryService, Reflector } from '@nestjs/core'
import { BaseStrategyRegistry } from '../strategy'
import { ISandboxProvider } from './sandbox.interface'
import { SANDBOX_PROVIDER } from './sandbox.decorator'

@Injectable()
export class SandboxProviderRegistry extends BaseStrategyRegistry<ISandboxProvider> {
  constructor(discoveryService: DiscoveryService, reflector: Reflector) {
    super(SANDBOX_PROVIDER, discoveryService, reflector)
  }
}
