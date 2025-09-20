import { Injectable } from '@nestjs/common';
import { DiscoveryService, Reflector } from '@nestjs/core';
import { TOOLSET_STRATEGY } from './strategy.decorator';
import { IToolsetStrategy } from './strategy.interface';
import { BaseStrategyRegistry } from '../strategy';

@Injectable()
export class ToolsetRegistry<TConfig = any>
  extends BaseStrategyRegistry<IToolsetStrategy<TConfig>> 
{
  constructor(
    discoveryService: DiscoveryService,
    reflector: Reflector
  ) {
    super(TOOLSET_STRATEGY, discoveryService, reflector);
  }
}
