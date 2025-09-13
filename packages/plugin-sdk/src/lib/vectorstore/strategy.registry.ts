import { Injectable } from '@nestjs/common';
import { DiscoveryService, Reflector } from '@nestjs/core';
import { BaseStrategyRegistry } from '../strategy';
import { VECTOR_STORE_STRATEGY } from './strategy.decorator';
import { IVectorStoreStrategy } from './strategy.interface';

@Injectable()
export class VectorStoreRegistry<TConfig = any, TInput = any>
  extends BaseStrategyRegistry<IVectorStoreStrategy<TConfig, TInput>> 
{
  constructor(
    discoveryService: DiscoveryService,
    reflector: Reflector
  ) {
    super(VECTOR_STORE_STRATEGY, discoveryService, reflector);
  }
}
