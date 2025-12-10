import { Injectable } from '@nestjs/common'
import { DiscoveryService, Reflector } from '@nestjs/core'
import { BaseStrategyRegistry } from '../../strategy'
import { SKILL_SOURCE_PROVIDER } from './skill-source-provider.decorator'
import { ISkillSourceProvider } from './skill-source-provider.interface'

@Injectable()
export class SkillSourceProviderRegistry extends BaseStrategyRegistry<ISkillSourceProvider> {
  constructor(discoveryService: DiscoveryService, reflector: Reflector) {
    super(SKILL_SOURCE_PROVIDER, discoveryService, reflector)
  }
}
