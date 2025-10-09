import { Injectable } from '@nestjs/common';
import { DiscoveryService, Reflector } from '@nestjs/core';
import { BaseStrategyRegistry } from '../../strategy';
import { DOCUMENT_SOURCE_STRATEGY } from './strategy.decorator';
import { IDocumentSourceStrategy } from './strategy.interface';

@Injectable()
export class DocumentSourceRegistry<TConfig = any>
  extends BaseStrategyRegistry<IDocumentSourceStrategy<TConfig>> 
{
  constructor(
    discoveryService: DiscoveryService,
    reflector: Reflector
  ) {
    super(DOCUMENT_SOURCE_STRATEGY, discoveryService, reflector);
  }
}
