import { CapabilityVersionBundle } from './capability-version'

export interface GoldenCaseRevision {
  caseId: string
  revision: number
  input: Record<string, string | number | boolean>
  expected: Record<string, string | number | boolean>
  slice: string
  risk: 'low' | 'medium' | 'high'
  evidenceRef: string
}

export interface DatasetSnapshot {
  snapshotId: string
  datasetId: string
  name: string
  evaluatorVersion: string
  metricDefinitionVersion: string
  cases: GoldenCaseRevision[]
  snapshotHash: string
  createdAt: string
}

export interface ReplayCaseRequest {
  evaluationRunId: string
  candidateId: string
  datasetSnapshotId: string
  caseRevision: GoldenCaseRevision
  baselineBundle: CapabilityVersionBundle
  candidateBundle: CapabilityVersionBundle
  randomSeed: number
  repeatIndex: number
}

export interface ReplayCaseResult {
  caseId: string
  baselineOutput: Record<string, string | number | boolean>
  candidateOutput: Record<string, string | number | boolean>
  expectedOutput: Record<string, string | number | boolean>
  baselinePassed: boolean
  candidatePassed: boolean
  severeError: boolean
  latencyMs: number
  cost: number
  traceRef: string
}

export interface MetricObservation {
  metricKey: string
  value: number
  unit: 'ratio' | 'count' | 'milliseconds' | 'currency'
  slice?: string
  blocking: boolean
}

export interface EvaluationMetrics {
  baselineAccuracy: number
  candidateAccuracy: number
  accuracyDelta: number
  severeErrors: number
  p95LatencyMs: number
  averageCost: number
  totalCases: number
  passedCases: number
}

export interface EvaluationGateResult {
  passed: boolean
  decision: 'promote' | 'hold' | 'reject'
  blockingReasons: string[]
}

export interface EvaluationRun {
  runId: string
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
