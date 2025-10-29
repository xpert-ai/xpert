import { Injectable } from '@nestjs/common'
import { DiscoveryService, Reflector } from '@nestjs/core'
import { BaseStrategyRegistry } from '../../strategy'
import { KNOWLEDGE_STRATEGY } from './knowledge-strategy.decorator'
import { KnowledgeStrategy } from './knowledge-strategy.interface'

@Injectable()
export class KnowledgeStrategyRegistry extends BaseStrategyRegistry<KnowledgeStrategy> {
  constructor(discoveryService: DiscoveryService, reflector: Reflector) {
    super(KNOWLEDGE_STRATEGY, discoveryService, reflector)
  }
}
