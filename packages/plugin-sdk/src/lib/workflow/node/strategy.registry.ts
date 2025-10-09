import { Injectable } from '@nestjs/common';
import { DiscoveryService, Reflector } from '@nestjs/core';
import { BaseStrategyRegistry } from '../../strategy';
import { WORKFLOW_NODE_STRATEGY } from './strategy.decorator';
import { IWorkflowNodeStrategy } from './strategy.interface';

/**
 * Registry for Workflow Node Strategies
 */
@Injectable()
export class WorkflowNodeRegistry<TConfig = any, TResult = any> extends BaseStrategyRegistry<IWorkflowNodeStrategy<TConfig, TResult>> {
  constructor(
    discoveryService: DiscoveryService,
    reflector: Reflector
  ) {
    super(WORKFLOW_NODE_STRATEGY, discoveryService, reflector);
  }
}
