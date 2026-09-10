import type { I18nText } from '../../i18n.model'

export type EvolutionTargetType = string

export type EvolutionScopeType = 'tenant' | 'organization' | 'workspace' | 'project'

export type EvolutionExecutionMode = 'production' | 'replay' | 'shadow' | 'canary'

export type EvolutionChannel = 'production' | 'shadow' | 'canary'

export type EvolutionRiskLevel = 'R1' | 'R2' | 'R3' | 'R4'

/** Provider-owned scope dimensions; the platform compares the complete frozen map. */
export interface EvolutionScopeDimensions {
  [key: string]: string | undefined
}

export interface EvolutionScope {
  type: EvolutionScopeType
  key: string
  dimensions?: EvolutionScopeDimensions
}

export interface EvolutionActor {
  actorId: string
  actorType: 'human' | 'agent' | 'system'
  actorRole?: string
}

export interface EvolutionProviderContext {
  tenantId: string
  organizationId?: string | null
  targetId: string
  scope: EvolutionScope
  correlationId: string
  executionId?: string
  actor: EvolutionActor
}

export interface EvolutionTargetCapabilities {
  candidateBuild: boolean
  replay: boolean
  shadow: boolean
  canary: boolean
  install: boolean
  rollback: boolean
}

export type EvolutionCandidateChangeFieldType = 'string' | 'number' | 'boolean' | 'string_array' | 'select'

export interface EvolutionCandidateChangeFieldDescriptor {
  key: string
  label: I18nText
  description?: I18nText
  type: EvolutionCandidateChangeFieldType
  required?: boolean
  placeholder?: I18nText
  defaultValue?: string | number | boolean | string[]
  options?: Array<{ label: I18nText; value: string }>
}

/**
 * Optional, provider-owned description used by the platform to render a
 * domain-neutral Candidate Change Set editor. The platform never interprets
 * the field keys or embeds domain rules of its own.
 */
export interface EvolutionCandidateFormDescriptor {
  description?: I18nText
  fields: EvolutionCandidateChangeFieldDescriptor[]
}

export interface EvolutionTargetDescriptor {
  strategies: import('./strategy').EvolutionStrategy[]
  category?: { key: string; label: I18nText }
  targetId: string
  targetType: EvolutionTargetType
  displayName: string
  providerKey: string
  providerVersion: string
  artifactSchemaVersion: string
  supportedScopes: EvolutionScopeType[]
  riskLevel: EvolutionRiskLevel
  metricSetId: string
  relatedTargetIds?: string[]
  candidateForm?: EvolutionCandidateFormDescriptor
  capabilities: EvolutionTargetCapabilities
  status: 'active' | 'disabled' | 'provider_unavailable'
}

export interface EvolutionArtifactRef {
  uri: string
  hash: string
  schemaVersion: string
  mediaType: 'application/json'
}
