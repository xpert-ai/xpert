import { CapabilityVersionBundle } from './capability-version'
import { EvolutionProviderContext, EvolutionScope } from './target'

/** Fixed revision of one reference case, containing both the decision input and the expected outcome. */
export interface GoldenCaseRevision {
  caseId: string
  revision: number
  input: Record<string, string | number | boolean>
  expected: Record<string, string | number | boolean>
  /** Named subset for measuring behavior on a particular class of cases. */
  slice: string
  risk: 'low' | 'medium' | 'high'
  evidenceRef: string
}

/** Frozen case revisions and scoring definitions used to compare runs on the same basis. */
export interface DatasetSnapshot {
  snapshotId: string
  datasetId: string
  targetId?: string
  scope?: EvolutionScope
  name: string
  /** Version of the evaluator that interprets the cases. */
  evaluatorVersion: string
  /** Version of the metric definitions under which results are comparable. */
  metricDefinitionVersion: string
  cases: GoldenCaseRevision[]
  snapshotHash: string
  createdAt: string
}

/** Paired offline comparison of a single case revision against the specified baseline and candidate bundles. */
export interface ReplayCaseRequest {
  context?: EvolutionProviderContext
  evaluationRunId: string
  candidateId: string
  datasetSnapshotId: string
  caseRevision: GoldenCaseRevision
  baselineBundle: CapabilityVersionBundle
  candidateBundle: CapabilityVersionBundle
  /** Optional artifact for the target's baseline bundle entry; its content hash must match that entry. */
  baselineArtifact?: import('./target').EvolutionArtifactRef
  /** Optional artifact for the target's candidate bundle entry; its content hash must match that entry. */
  candidateArtifact?: import('./target').EvolutionArtifactRef
  randomSeed: number
  /** Evaluator version pinned by the dataset snapshot, when supplied. */
  evaluatorVersion?: string
  /** Scoring definitions pinned by the dataset snapshot, when supplied. */
  metricDefinitionVersion?: string
  /** Zero-based repetition of this case under the same evaluation run. */
  repeatIndex: number
}

/** Identity of a collection of reference cases; individual runs refer to a frozen snapshot of it. */
export interface GoldenDataset {
  datasetId: string
  targetId: string
  name: string
  description?: string
  caseCount: number
  status: 'draft' | 'ready' | 'archived'
  createdAt: string
  updatedAt: string
}

/** Paired outputs and pass judgments against the same expectation; preserves regressions even when aggregate accuracy improves. */
export interface ReplayCaseResult {
  caseId: string
  baselineOutput: Record<string, string | number | boolean>
  candidateOutput: Record<string, string | number | boolean>
  expectedOutput: Record<string, string | number | boolean>
  baselinePassed: boolean
  candidatePassed: boolean
  /** Whether the candidate incurred a severe error under the evaluator's risk criteria. */
  severeError: boolean
  latencyMs: number
  cost: number
  /** Target-specific measurements for this comparison, in addition to the paired pass judgments. */
  observations?: MetricObservation[]
  traceRef: string
}

/** One named measurement with an explicit unit and optional case subset. */
export interface MetricObservation {
  metricKey: string
  value: number
  unit: 'ratio' | 'count' | 'milliseconds' | 'currency'
  slice?: string
  /** A violation reported by the evaluator that prevents promotion. */
  blocking: boolean
}

/** Aggregate outcomes for the baseline and candidate measured on the same replay cases. */
export interface EvaluationMetrics {
  baselineAccuracy: number
  candidateAccuracy: number
  /** Candidate accuracy minus baseline accuracy, expressed on the same ratio scale. */
  accuracyDelta: number
  severeErrors: number
  p95LatencyMs: number
  averageCost: number
  totalCases: number
  passedCases: number
}

/** Promotion recommendation from replay. Passing this gate does not grant release approval. */
export interface EvaluationGateResult {
  passed: boolean
  decision: 'promote' | 'hold' | 'reject'
  blockingReasons: string[]
}

/** Result of a golden replay, binding the candidate and snapshot to both sets of version bindings. */
export interface EvaluationRun {
  evaluatorKind: 'golden_replay'
  runId: string
  targetId?: string
  scope?: EvolutionScope
  candidateId: string
  datasetSnapshotId: string
  baselineBundle: CapabilityVersionBundle
  candidateBundle: CapabilityVersionBundle
  status: 'running' | 'passed' | 'failed'
  metrics: EvaluationMetrics
  gate: EvaluationGateResult
  caseResults: ReplayCaseResult[]
  startedAt: string
  completedAt?: string
}
