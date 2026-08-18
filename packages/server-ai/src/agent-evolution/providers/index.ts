export * from './conformance-field-mapping.provider'
export * from './conformance-intent-routing.provider'

import { ConformanceFieldMappingProvider } from './conformance-field-mapping.provider'
import { ConformanceIntentRoutingProvider } from './conformance-intent-routing.provider'

export const AGENT_EVOLUTION_CONFORMANCE_PROVIDERS = [ConformanceFieldMappingProvider, ConformanceIntentRoutingProvider]
