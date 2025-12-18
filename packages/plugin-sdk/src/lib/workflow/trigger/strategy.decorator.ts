import { applyDecorators, SetMetadata } from '@nestjs/common';
import { STRATEGY_META_KEY } from '../../types';

export const WORKFLOW_TRIGGER_STRATEGY = 'WORKFLOW_TRIGGER_STRATEGY';

export const WorkflowTriggerStrategy = (provider: string) =>
  applyDecorators(
    SetMetadata(WORKFLOW_TRIGGER_STRATEGY, provider),
    SetMetadata(STRATEGY_META_KEY, WORKFLOW_TRIGGER_STRATEGY)
  );