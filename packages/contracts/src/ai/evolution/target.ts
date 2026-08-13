export type EvolutionTargetType = 'prompt_policy' | 'routing_policy' | 'extraction_policy' | 'test_fixture'

export type EvolutionScopeType = 'tenant' | 'organization' | 'workspace' | 'project'

export type EvolutionExecutionMode = 'production' | 'replay' | 'shadow' | 'canary'

export type EvolutionChannel = 'production' | 'shadow' | 'canary'

export type EvolutionRiskLevel = 'R1' | 'R2' | 'R3' | 'R4'

export interface EvolutionScope {
  type: EvolutionScopeType
  key: string
}

export interface EvolutionTargetCapabilities {
  candidateBuild: boolean
  replay: boolean
  shadow: boolean
  canary: boolean
  install: boolean
  rollback: boolean
}

export interface EvolutionTargetDescriptor {
  targetId: string
  targetType: EvolutionTargetType
  displayName: string
  providerKey: string
  providerVersion: string
  artifactSchemaVersion: string
  supportedScopes: EvolutionScopeType[]
  riskLevel: EvolutionRiskLevel
  metricSetId: string
  capabilities: EvolutionTargetCapabilities
  status: 'active' | 'disabled' | 'provider_unavailable'
}

export interface EvolutionArtifactRef {
  uri: string
  hash: string
  schemaVersion: string
  mediaType: 'application/json'
}
