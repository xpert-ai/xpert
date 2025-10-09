import { Injectable } from '@nestjs/common'
import { DiscoveryService, Reflector } from '@nestjs/core'
import { BaseStrategyRegistry } from '../../strategy'
import { RETRIEVER_STRATEGY } from './strategy.decorator'
import { IRetrieverStrategy } from './strategy.interface'

@Injectable()
export class RetrieverRegistry extends BaseStrategyRegistry<IRetrieverStrategy> {
  constructor(discoveryService: DiscoveryService, reflector: Reflector) {
    super(RETRIEVER_STRATEGY, discoveryService, reflector)
  }
}
