import type { EvolutionRuntimeApi, EvolutionChangeRuntimeApi, EvolutionBaselineRuntimeApi } from '@xpert-ai/contracts'
import { createRuntimeCapability } from '../core'

export const EVOLUTION_RUNTIME_SERVICE_TOKEN = 'XPERT_EVOLUTION_RUNTIME_SERVICE'

/** Capability for inspecting and publishing source baselines within an authorized organization. */
export const EvolutionBaselineRuntimeCapability = createRuntimeCapability<EvolutionBaselineRuntimeApi>(
  'platform.agent-evolution.baselines',
  {
    description:
      'Inspect and initialize organization rule baselines with administrator authorization and revision checks.'
  }
)

/** Capability for version selection and evidence tied to Agent executions. */
export const EvolutionRuntimeCapability = createRuntimeCapability<EvolutionRuntimeApi>('platform.agent-evolution', {
  description: 'Ingest learning signals and resolve immutable capability versions for domain runtimes.'
})

/** Capability for scoped preparation, review and publication of versioned changes. */
export const EvolutionChangeRuntimeCapability = createRuntimeCapability<EvolutionChangeRuntimeApi>(
  'platform.agent-evolution.changes',
  {
    description: 'Prepare, evaluate and publish versioned changes through target-owned validators and effect providers.'
  }
)
