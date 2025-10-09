import { Injectable } from '@nestjs/common';
import { DiscoveryService, Reflector } from '@nestjs/core';
import { BaseStrategyRegistry } from '../../strategy';
import { IMAGE_UNDERSTANDING_STRATEGY } from './strategy.decorator';
import { IImageUnderstandingStrategy, TImageUnderstandingConfig } from './strategy.interface';

@Injectable()
export class ImageUnderstandingRegistry<TConfig extends TImageUnderstandingConfig = TImageUnderstandingConfig>
  extends BaseStrategyRegistry<IImageUnderstandingStrategy<TConfig>> 
{
  constructor(
    discoveryService: DiscoveryService,
    reflector: Reflector
  ) {
    super(IMAGE_UNDERSTANDING_STRATEGY, discoveryService, reflector);
  }
}
