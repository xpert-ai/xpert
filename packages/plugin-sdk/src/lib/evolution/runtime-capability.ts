import type { EvolutionRuntimeApi } from '@xpert-ai/contracts'
import { createRuntimeCapability } from '../core'

export const EVOLUTION_RUNTIME_SERVICE_TOKEN = 'XPERT_EVOLUTION_RUNTIME_SERVICE'

export const EvolutionRuntimeCapability = createRuntimeCapability<EvolutionRuntimeApi>('platform.agent-evolution', {
  description: 'Ingest learning signals and resolve immutable capability versions for domain runtimes.'
})
