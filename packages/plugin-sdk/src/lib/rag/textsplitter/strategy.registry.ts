import { Injectable } from '@nestjs/common';
import { DiscoveryService, Reflector } from '@nestjs/core';
import { BaseStrategyRegistry } from '../../strategy';
import { TEXT_SPLITTER_STRATEGY } from './strategy.decorator';
import { ITextSplitterStrategy } from './strategy.interface';

@Injectable()
export class TextSplitterRegistry<TConfig = any>
  extends BaseStrategyRegistry<ITextSplitterStrategy<TConfig>> 
{
  constructor(
    discoveryService: DiscoveryService,
    reflector: Reflector
  ) {
    super(TEXT_SPLITTER_STRATEGY, discoveryService, reflector);
  }
}
