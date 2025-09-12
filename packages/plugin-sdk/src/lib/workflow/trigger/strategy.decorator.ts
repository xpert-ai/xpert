import { SetMetadata } from '@nestjs/common';

export const WORKFLOW_TRIGGER_STRATEGY = 'WORKFLOW_TRIGGER_STRATEGY';

export const WorkflowTriggerStrategy = (provider: string) =>
  SetMetadata(WORKFLOW_TRIGGER_STRATEGY, provider);