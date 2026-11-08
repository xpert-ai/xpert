import type { I18nText } from '../../i18n.model'

/** Provider-defined family of targets; the target ID identifies a particular target. */
export type EvolutionTargetType = string

/** Resource boundary within which a target's versions may take effect. */
export type EvolutionScopeType = 'tenant' | 'organization' | 'workspace' | 'project'

/** Distinguishes offline replay from executions serving or observing live decisions. */
export type EvolutionExecutionMode = 'production' | 'replay' | 'shadow' | 'canary'

/** Role of a deployed version: normal traffic, a served canary cohort, or observation only. */
export type EvolutionChannel = 'production' | 'shadow' | 'canary'

/** Governance risk tier of a target or change, independent of its measured accuracy. */
export type EvolutionRiskLevel = 'R1' | 'R2' | 'R3' | 'R4'

/** Additional provider-defined dimensions of scope identity; equality includes the complete map. */
export interface EvolutionScopeDimensions {
  [key: string]: string | undefined
}

/** Identifies the resource boundary to which evidence, candidates and version assignments belong. */
export interface EvolutionScope {
  type: EvolutionScopeType
  key: string
  dimensions?: EvolutionScopeDimensions
}

/** Identity responsible for an operation; an audit attribution, not a permission grant. */
export interface EvolutionActor {
  actorId: string
  actorType: 'human' | 'agent' | 'system'
  actorRole?: string
}

/** Identity and resource scope of a provider operation. Domain input must not override this context. */
export interface EvolutionProviderContext {
  tenantId: string
  organizationId?: string | null
  targetId: string
  scope: EvolutionScope
  /** Groups related work for tracing even when no Agent execution is involved. */
  correlationId: string
  executionId?: string
  actor: EvolutionActor
}

/** Declares which evolution operations a target supports; support does not authorize an actor to perform them. */
export interface EvolutionTargetCapabilities {
  candidateBuild: boolean
  replay: boolean
  shadow: boolean
  canary: boolean
  install: boolean
  rollback: boolean
}

/** Value category of a provider-defined change field; a select value is an option key. */
export type EvolutionCandidateChangeFieldType = 'string' | 'number' | 'boolean' | 'string_array' | 'select'

/** Names and constrains one entry in the target's change set; its key has provider-defined meaning. */
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

/** Provider-owned description of candidate inputs. The provider owns the meaning and validation of the field keys. */
export interface EvolutionCandidateFormDescriptor {
  description?: I18nText
  fields: EvolutionCandidateChangeFieldDescriptor[]
}

/** Declares a target's identity, compatible artifact format and supported evolution strategies. */
export interface EvolutionTargetDescriptor {
  strategies: import('./strategy').EvolutionStrategy[]
  category?: { key: string; label: I18nText }
  /** Stable identity shared by the target's evidence, versions and releases. */
  targetId: string
  targetType: EvolutionTargetType
  displayName: string
  /** Provider-owned localized name of the same registered capability. */
  label?: I18nText
  /** Registration key of the implementation responsible for this target. */
  providerKey: string
  /** Version of the provider implementation, independent of any capability version it produces. */
  providerVersion: string
  /** Version of the artifact format declared by the provider. */
  artifactSchemaVersion: string
  supportedScopes: EvolutionScopeType[]
  riskLevel: EvolutionRiskLevel
  metricSetId: string
  relatedTargetIds?: string[]
  /** Provider vocabulary for feedback emitted by this target, including previously recorded events. */
  feedbackVocabulary?: {
    /** Stable reason codes that denote a correction to a prediction. */
    correctionReasons: string[]
    /** Localized labels for exact scalar prediction and outcome values. */
    values?: Record<string, I18nText>
    /** Localized labels for provider-owned reason codes. */
    reasons?: Record<string, I18nText>
  }
  candidateForm?: EvolutionCandidateFormDescriptor
  capabilities: EvolutionTargetCapabilities
  status: 'active' | 'disabled' | 'provider_unavailable'
}

/** Identifies a provider-defined artifact by its content and schema, independent of how it is stored. */
export interface EvolutionArtifactRef {
  /** Provider-defined content location or inline representation. */
  uri: string
  /** Identity of the artifact content; a different payload must not be substituted under the same hash. */
  hash: string
  /** Format of this payload, independent of the provider and capability versions. */
  schemaVersion: string
  mediaType: 'application/json'
}
