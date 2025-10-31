import { Injectable } from '@nestjs/common'
import { DiscoveryService, Reflector } from '@nestjs/core'
import { BaseStrategyRegistry } from '../strategy'
import { AI_MODEL_PROVIDER } from './ai-model-provider.decorator'
import { IAIModelProviderStrategy } from './ai-model-provider.interface'

@Injectable()
export class AIModelProviderRegistry extends BaseStrategyRegistry<IAIModelProviderStrategy> {
  constructor(discoveryService: DiscoveryService, reflector: Reflector) {
    super(AI_MODEL_PROVIDER, discoveryService, reflector)
  }
}
