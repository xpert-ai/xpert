import { Injectable } from '@nestjs/common'
import { DiscoveryService, Reflector } from '@nestjs/core'
import { BaseStrategyRegistry } from '../../strategy'
import { WORKFLOW_TRIGGER_STRATEGY } from './strategy.decorator'
import { IWorkflowTriggerStrategy } from './strategy.interface'

@Injectable()
export class WorkflowTriggerRegistry<T = any> extends BaseStrategyRegistry<IWorkflowTriggerStrategy<T>> {

	constructor(
		discoveryService: DiscoveryService,
		reflector: Reflector
	) {
		super(WORKFLOW_TRIGGER_STRATEGY, discoveryService, reflector);
	}

}
