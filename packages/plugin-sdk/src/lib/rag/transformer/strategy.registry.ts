import { Injectable } from '@nestjs/common'
import { DiscoveryService, Reflector } from '@nestjs/core'
import { BaseStrategyRegistry } from '../../strategy'
import { DOCUMENT_TRANSFORMER_STRATEGY } from './strategy.decorator'
import { IDocumentTransformerStrategy, TDocumentTransformerConfig } from './strategy.interface'

@Injectable()
export class DocumentTransformerRegistry<
  TConfig extends TDocumentTransformerConfig = TDocumentTransformerConfig
> extends BaseStrategyRegistry<IDocumentTransformerStrategy<TConfig>> {
  constructor(discoveryService: DiscoveryService, reflector: Reflector) {
    super(DOCUMENT_TRANSFORMER_STRATEGY, discoveryService, reflector)
  }
}
