export type ConnectionImpactStatus = 'current' | 'draft' | 'published' | 'historical' | 'unresolved'
export type ConnectionImpactEvidence = 'default' | 'relation' | 'json' | 'saved'
export type ConnectionImpactResource = 'default' | 'assistant' | 'knowledgebase' | 'project' | 'connection' | 'binding'

/** An inventory entry, not proof that a model is executing or that a JSON match is effective. */
export interface ConnectionImpactReference {
  resourceType: ConnectionImpactResource
  resourceId: string
  resourceName: string
  organizationId: string | null
  version: string | null
  status: ConnectionImpactStatus
  evidence: ConnectionImpactEvidence
  field: string
  bindingId: string | null
  model: string | null
  modelType: string | null
}

export interface ConnectionImpact {
  scope: { tenantId: string }
  /** Fixed default-setting rows; also the existing prerequisite for disabling. */
  defaults: number
  /** Stored copilot_model rows on this connection, not distinct models or business resources. */
  bindings: number
  /** Current Assistant draft documents containing candidate JSON matches. */
  drafts: number
  bindingUsage: { current: number; historicalOnly: number; unresolved: number }
  currentResources: number
  historicalResources: number
  jsonMatches: number
  references: ConnectionImpactReference[]
}
