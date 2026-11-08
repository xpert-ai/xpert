import { EvolutionTargetProvider } from '@xpert-ai/contracts'
import { Injectable } from '@nestjs/common'
import { DiscoveryService, Reflector } from '@nestjs/core'
import { BaseStrategyRegistry } from '../strategy'
import { EVOLUTION_TARGET_PROVIDER } from './provider.decorator'

/** Registry of evolution targets visible within a strategy scope. */
@Injectable()
export class EvolutionTargetProviderRegistry extends BaseStrategyRegistry<EvolutionTargetProvider> {
  constructor(discoveryService: DiscoveryService, reflector: Reflector) {
    super(EVOLUTION_TARGET_PROVIDER, discoveryService, reflector)
  }

  /** Returns target declarations visible in the supplied organization scope. */
  listDescriptors(organizationId?: string) {
    return this.list(organizationId).map((provider) => provider.descriptor)
  }
}
