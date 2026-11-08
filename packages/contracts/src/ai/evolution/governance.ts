/** Filters and ordering within the caller's visible evolution records; these fields do not select an authorization scope. */
export interface EvolutionPageQuery {
  page?: number
  pageSize?: number
  search?: string
  targetId?: string
  status?: string
  sort?: 'createdAt' | 'updatedAt' | 'status'
  order?: 'ASC' | 'DESC'
}

/** Filters runtime observations or audit events without widening the caller’s organization scope. */
export interface EvolutionReleaseEvidenceQuery extends EvolutionPageQuery {
  /** Limits evidence to the named release package and its deployments. */
  releasePackageId?: string
}

/** Page of visible records and the total number matching the query across pages. */
export interface EvolutionPage<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

/** Sets the evidence review disposition; marking an event golden is distinct from freezing a dataset. */
export interface ReviewLearningEventRequest {
  reviewStatus: 'pending' | 'ignored' | 'golden'
}

/** Selects either an explicit set of events or a seed for related evidence under the named strategy, never both. */
export type DiagnoseLearningEventsRequest = { strategyId: string } & (
  | { eventIds: string[]; seedEventId?: never }
  | { seedEventId: string; eventIds?: never }
)

/** Pairs proposed diagnoses with their evidence clusters; neither constitutes a candidate or approval. */
export interface EvolutionAnalysisResult {
  diagnoses: import('./learning-event').EvolutionDiagnosis[]
  clusters: import('./learning-event').EvolutionEventCluster[]
}

/** Records a scoped change hypothesis supported by selected events under the named strategy. */
export interface CreateImprovementProposalRequest {
  strategyId: string
  targetId: string
  scope: import('./target').EvolutionScope
  eventIds: string[]
  title: string
  problemStatement: string
  rootCause: string
  changeHypothesis: string
  riskLevel: import('./target').EvolutionRiskLevel
}

/** Binds the requested changes to a specific proposal revision. */
export interface BuildCandidateCommand {
  proposalId: string
  proposalRevision: number
  changeSet: Record<string, string | number | boolean | string[]>
}

/** Freezes reference cases with the evaluator and metric definitions for one target and scope. */
export interface CreateDatasetSnapshotRequest {
  datasetId: string
  targetId: string
  scope: import('./target').EvolutionScope
  name: string
  evaluatorVersion: string
  metricDefinitionVersion: string
  cases: import('./evaluation').GoldenCaseRevision[]
}

/** Pairs a particular candidate with a frozen dataset for replay. */
export interface EvaluateCandidateCommand {
  candidateId: string
  datasetSnapshotId: string
}

/** Decision on a candidate evaluated in the specified run, with the signer's reason. */
export interface DecideCandidateApprovalRequest {
  evaluationRunId: string
  decision: 'approved' | 'rejected'
  reason: string
}

/** Identifies the candidate, evaluation and approvals that must agree for staged publication. */
export interface CreateReleasePackageRequest {
  candidateId: string
  evaluationRunId: string
  approvalIds: string[]
  shadowMinimumSamples?: number
}

/** Selects a canary traffic stage within the staged release policy. */
export interface StartDeploymentRequest {
  canaryPercent?: 5 | 25 | 50
}

/** Requests a single-use assignment for one subject in an eligible test deployment. */
export interface CreateEvolutionCanaryTestOverrideRequest {
  subjectKey: string
  reason: string
  /** Requested lifetime in minutes, subject to the release's test-assignment limits. */
  expiresInMinutes?: number
}

/** Governed background operation associated with an evolution resource. */
export type EvolutionJobType = 'change_preparation' | 'evaluation' | 'install' | 'shadow' | 'canary' | 'rollback'
/** State of the background work, distinct from the governed resource's own state. */
export type EvolutionJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

/** Identifies a single background operation and its outcome for the affected evolution resource. */
export interface EvolutionJob {
  jobId: string
  jobType: EvolutionJobType
  resourceId: string
  status: EvolutionJobStatus
  queueJobId?: string
  errorCode?: string
  errorMessage?: string
  createdAt: string
  startedAt?: string
  completedAt?: string
}
