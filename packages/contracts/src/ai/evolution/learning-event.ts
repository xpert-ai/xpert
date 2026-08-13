import { EvolutionScope } from './target'

export type LearningEventType = 'prediction_reviewed' | 'execution_failed' | 'business_outcome'

export type LearningEventConfidence = 'L1' | 'L2' | 'L3' | 'L4'

export interface LearningEventInput {
  eventId?: string
  eventType: LearningEventType
  schemaVersion: string
  idempotencyKey: string
  eventTime: string
  scope: EvolutionScope
  executionId?: string
  threadId?: string
  traceId?: string
  targetId: string
  decisionPoint: string
  subjectRef: string
  inputFingerprint: string
  predictionSummary: string
  finalOutcomeSummary: string
  confidence: number
  reasonCodes: string[]
  capabilityVersionBundleId: string
  bundleHash: string
  trustLevel: LearningEventConfidence
  classification: 'public' | 'internal' | 'confidential'
  redactionStatus: 'not_required' | 'redacted'
}

export interface LearningEvent extends LearningEventInput {
  eventId: string
  createdAt: string
}

export interface ImprovementProposal {
  proposalId: string
  revision: number
  targetId: string
  scope: EvolutionScope
  title: string
  problemStatement: string
  rootCause: string
  changeHypothesis: string
  evidenceEventIds: string[]
  baseVersionId: string
  riskLevel: 'R1' | 'R2' | 'R3' | 'R4'
  status: 'draft' | 'ready' | 'candidate_built' | 'rejected'
  createdAt: string
  createdBy: string
}
