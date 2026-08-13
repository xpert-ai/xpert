import { EvolutionArtifactRef, EvolutionScope } from './target'

export type EvolutionCandidateStatus =
  | 'building'
  | 'ready'
  | 'evaluating'
  | 'evaluation_failed'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'packaged'
  | 'expired'

export interface EvolutionCandidate {
  candidateId: string
  targetId: string
  baseVersionId: string
  proposalId: string
  proposalRevision: number
  artifact: EvolutionArtifactRef
  providerKey: string
  providerVersion: string
  dependencyVersionIds: string[]
  targetScope: EvolutionScope
  buildInputsHash: string
  status: EvolutionCandidateStatus
  createdBy: string
  createdAt: string
}

export interface BuildEvolutionCandidateRequest {
  targetId: string
  scope: EvolutionScope
  proposalId: string
  proposalRevision: number
  baseVersionId: string
  changeSet: Record<string, string | number | boolean | string[]>
  evidenceEventIds: string[]
  dependencyVersionIds: string[]
  actorId: string
  idempotencyKey: string
}

export interface CandidateBuildResult {
  artifact: EvolutionArtifactRef
  normalizedManifest: Record<string, string | number | boolean | string[]>
  dependencyVersionIds: string[]
  validationSummary: string
  warnings: string[]
  providerTraceId: string
  buildInputsHash: string
}

export interface ValidateEvolutionCandidateRequest {
  targetId: string
  scope: EvolutionScope
  artifact: EvolutionArtifactRef
  baseVersionId: string
  dependencyVersionIds: string[]
}

export interface CandidateValidationResult {
  valid: boolean
  failureCodes: string[]
  warnings: string[]
}
