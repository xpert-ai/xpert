import { Injectable } from '@nestjs/common';
import { DiscoveryService, Reflector } from '@nestjs/core';
import { BaseStrategyRegistry } from '../../strategy';
import { DOCUMENT_TRANSFORMER_STRATEGY } from './strategy.decorator';
import { IDocumentTransformerStrategy } from './strategy.interface';

@Injectable()
export class DocumentTransformerRegistry<TConfig = any>
  extends BaseStrategyRegistry<IDocumentTransformerStrategy<TConfig>> 
{
  constructor(
    discoveryService: DiscoveryService,
    reflector: Reflector
  ) {
    super(DOCUMENT_TRANSFORMER_STRATEGY, discoveryService, reflector);
  }
}
