export interface EvolutionPageQuery {
  page?: number
  pageSize?: number
  search?: string
  targetId?: string
  status?: string
  sort?: 'createdAt' | 'updatedAt' | 'status'
  order?: 'ASC' | 'DESC'
}

export interface EvolutionPage<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export interface ReviewLearningEventRequest {
  reviewStatus: 'pending' | 'ignored' | 'golden'
}

export interface DiagnoseLearningEventsRequest {
  eventIds: string[]
}

export interface EvolutionAnalysisResult {
  diagnoses: import('./learning-event').EvolutionDiagnosis[]
  clusters: import('./learning-event').EvolutionEventCluster[]
}

export interface CreateImprovementProposalRequest {
  targetId: string
  scope: import('./target').EvolutionScope
  eventIds: string[]
  title: string
  problemStatement: string
  rootCause: string
  changeHypothesis: string
  riskLevel: import('./target').EvolutionRiskLevel
}

export interface BuildCandidateCommand {
  proposalId: string
  proposalRevision: number
  changeSet: Record<string, string | number | boolean | string[]>
}

export interface CreateDatasetSnapshotRequest {
  datasetId: string
  targetId: string
  scope: import('./target').EvolutionScope
  name: string
  evaluatorVersion: string
  metricDefinitionVersion: string
  cases: import('./evaluation').GoldenCaseRevision[]
}

export interface EvaluateCandidateCommand {
  candidateId: string
  datasetSnapshotId: string
}

export interface DecideCandidateApprovalRequest {
  evaluationRunId: string
  decision: 'approved' | 'rejected'
  reason: string
}

export interface CreateReleasePackageRequest {
  candidateId: string
  evaluationRunId: string
  approvalIds: string[]
  shadowMinimumSamples?: number
}

export interface StartDeploymentRequest {
  canaryPercent?: 5 | 25 | 50
}

export type EvolutionJobType = 'evaluation' | 'install' | 'shadow' | 'canary' | 'rollback'
export type EvolutionJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

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
