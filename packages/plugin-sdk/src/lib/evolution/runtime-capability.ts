import type { EvolutionRuntimeApi, EvolutionChangeRuntimeApi } from '@xpert-ai/contracts'
import { createRuntimeCapability } from '../core'

export const EVOLUTION_RUNTIME_SERVICE_TOKEN = 'XPERT_EVOLUTION_RUNTIME_SERVICE'

export const EvolutionRuntimeCapability = createRuntimeCapability<EvolutionRuntimeApi>('platform.agent-evolution', {
  description: 'Ingest learning signals and resolve immutable capability versions for domain runtimes.'
})

export const EvolutionChangeRuntimeCapability = createRuntimeCapability<EvolutionChangeRuntimeApi>(
  'platform.agent-evolution.changes',
  {
    description: 'Prepare, evaluate and publish versioned changes through target-owned validators and effect providers.'
  }
)
