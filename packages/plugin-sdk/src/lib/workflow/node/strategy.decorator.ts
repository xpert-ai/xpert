import { SetMetadata } from '@nestjs/common';

export const WORKFLOW_NODE_STRATEGY = 'WORKFLOW_NODE_STRATEGY';

/**
 * Decorator to mark a provider as a Workflow Node Strategy
 */
export const WorkflowNodeStrategy = (provider: string) =>
  SetMetadata(WORKFLOW_NODE_STRATEGY, provider);
