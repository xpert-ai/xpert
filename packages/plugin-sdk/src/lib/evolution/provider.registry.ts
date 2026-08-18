import { EvolutionTargetProvider } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { DiscoveryService, Reflector } from '@nestjs/core'
import { BaseStrategyRegistry } from '../strategy'
import { EVOLUTION_TARGET_PROVIDER } from './provider.decorator'

@Injectable()
export class EvolutionTargetProviderRegistry extends BaseStrategyRegistry<EvolutionTargetProvider> {
  constructor(discoveryService: DiscoveryService, reflector: Reflector) {
    super(EVOLUTION_TARGET_PROVIDER, discoveryService, reflector)
  }

  listDescriptors(organizationId?: string) {
    return this.list(organizationId).map((provider) => provider.descriptor)
  }
}
