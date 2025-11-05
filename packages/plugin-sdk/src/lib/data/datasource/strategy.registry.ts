import { Injectable } from '@nestjs/common'
import { DiscoveryService, Reflector } from '@nestjs/core'
import { BaseStrategyRegistry } from '../../strategy'
import { DATASOURCE_STRATEGY } from './strategy.decorator'
import { IDataSourceStrategy } from './strategy.interface'
import { AdapterBaseOptions } from './types'

@Injectable()
export class DataSourceStrategyRegistry<TOptions extends AdapterBaseOptions = any> extends BaseStrategyRegistry<IDataSourceStrategy<TOptions>> {
  constructor(discoveryService: DiscoveryService, reflector: Reflector) {
    super(DATASOURCE_STRATEGY, discoveryService, reflector)
  }
}
