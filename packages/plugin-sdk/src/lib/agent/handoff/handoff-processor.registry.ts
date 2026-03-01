import { Injectable } from '@nestjs/common'
import { DiscoveryService, Reflector } from '@nestjs/core'
import { BaseStrategyRegistry } from '../../strategy'
import { HANDOFF_PROCESSOR_STRATEGY } from './handoff-processor.decorator'
import { IHandoffProcessor } from './handoff.interface'

@Injectable()
export class HandoffProcessorRegistry extends BaseStrategyRegistry<IHandoffProcessor> {
  constructor(discoveryService: DiscoveryService, reflector: Reflector) {
    super(HANDOFF_PROCESSOR_STRATEGY, discoveryService, reflector)
  }
}
