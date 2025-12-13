import { applyDecorators, SetMetadata } from '@nestjs/common';
import { STRATEGY_META_KEY } from '../../types';

export const WORKFLOW_NODE_STRATEGY = 'WORKFLOW_NODE_STRATEGY';

/**
 * Decorator to mark a provider as a Workflow Node Strategy
 */
export const WorkflowNodeStrategy = (provider: string) =>
  applyDecorators(
    SetMetadata(WORKFLOW_NODE_STRATEGY, provider),
    SetMetadata(STRATEGY_META_KEY, WORKFLOW_NODE_STRATEGY)
  );
