export type EvolutionPersistenceTable =
  | 'agent_evolution_target'
  | 'agent_evolution_capability_version'
  | 'agent_evolution_capability_bundle'
  | 'agent_evolution_active_pointer'
  | 'agent_evolution_learning_event'
  | 'agent_evolution_proposal'
  | 'agent_evolution_candidate'
  | 'agent_evolution_dataset_snapshot'
  | 'agent_evolution_evaluation_run'
  | 'agent_evolution_approval'
  | 'agent_evolution_release_package'
  | 'agent_evolution_release_deployment'
  | 'agent_evolution_audit_event'

export interface EvolutionPersistenceTableEvidence {
  table: EvolutionPersistenceTable
  expectedCount: number
  actualCount: number
  recordIds: string[]
  missingRecordIds: string[]
}

export interface EvolutionPersistenceEvidence {
  verified: boolean
  rowCount: number
  tables: EvolutionPersistenceTableEvidence[]
}

export interface EvolutionExampleDescriptor {
  key: string
  name: string
  description: string
  dataClassification: 'synthetic_test_fixture'
}

export interface EvolutionSimulationResult {
  example: EvolutionExampleDescriptor
  simulationId: string
  targetId: string
  eventIds: string[]
  proposalId: string
  candidateId: string
  datasetSnapshotId: string
  evaluationRunId: string
  approvalId: string
  releasePackageId: string
  deploymentIds: string[]
  bundleIds: string[]
  versionIds: string[]
  pointerId: string
  previousVersionId: string
  activeVersionId: string
  pointerRevision: number
  gatePassed: boolean
  auditIds: string[]
  auditActions: string[]
  persistence: EvolutionPersistenceEvidence
}
