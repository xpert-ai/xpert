/** Persistence surfaces covered by the synthetic evolution example, not an exhaustive schema. */
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

/** Expected versus observed record identities for one table in a simulation. */
export interface EvolutionPersistenceTableEvidence {
  table: EvolutionPersistenceTable
  expectedCount: number
  actualCount: number
  recordIds: string[]
  missingRecordIds: string[]
}

/** Evidence that the expected simulation records exist, distinct from the simulated release gate result. */
export interface EvolutionPersistenceEvidence {
  verified: boolean
  rowCount: number
  tables: EvolutionPersistenceTableEvidence[]
}

/** Identifies an example using synthetic evidence; its results do not represent live traffic. */
export interface EvolutionExampleDescriptor {
  key: string
  name: string
  description: string
  dataClassification: 'synthetic_test_fixture'
}

/** Trace of the versions, decisions and persistence evidence produced by a single synthetic run. */
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
