import { EvolutionArtifactRef, EvolutionProviderContext, EvolutionScope } from './target'

/** Governance state of a candidate artifact; approval or packaging alone does not make it effective. */
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

/** Artifact proposed for one target, bound to its baseline, proposal revision and strategy. */
export interface EvolutionCandidate {
  definition?: Omit<import('./change').EvolutionChangeCandidate, 'artifact'>
  evaluationRunId?: string
  strategy: import('./strategy').EvolutionStrategySnapshot
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
  /** Fingerprint of build inputs, distinct from the content hash of the resulting artifact. */
  buildInputsHash: string
  status: EvolutionCandidateStatus
  createdBy: string
  createdAt: string
}

/** Inputs to a target-owned build. Evidence and dependencies belong to the specified proposal revision and scope. */
export interface BuildEvolutionCandidateRequest {
  context?: EvolutionProviderContext
  targetId: string
  scope: EvolutionScope
  proposalId: string
  proposalRevision: number
  baseVersionId: string
  /** Artifact of baseVersionId when supplied; it must not be replaced by the currently active version. */
  baseArtifact?: EvolutionArtifactRef
  /** Target-defined changes to apply to the baseline, not an already-built artifact. */
  changeSet: Record<string, string | number | boolean | string[]>
  /** Evidence selection fixed by the proposal; independent of the order of supplied event records. */
  evidenceEventIds: string[]
  /**
   * Scoped records for the selected IDs, matched by eventId rather than position.
   * If records are absent, the IDs still identify the proposal's evidence.
   */
  evidenceEvents?: import('./learning-event').LearningEvent[]
  dependencyVersionIds: string[]
  actorId: string
  /** Identifies the same build operation across retries. */
  idempotencyKey: string
}

/** Provider-produced artifact and build provenance, prior to replay or approval. */
export interface CandidateBuildResult {
  artifact: EvolutionArtifactRef
  /** Provider-defined summary of the effective build inputs. */
  normalizedManifest: Record<string, string | number | boolean | string[]>
  dependencyVersionIds: string[]
  validationSummary: string
  warnings: string[]
  providerTraceId: string
  buildInputsHash: string
}

/** Asks whether a specific artifact is valid for the proposed target and baseline. */
export interface ValidateEvolutionCandidateRequest {
  context?: EvolutionProviderContext
  targetId: string
  scope: EvolutionScope
  artifact: EvolutionArtifactRef
  baseVersionId: string
  baseArtifact?: EvolutionArtifactRef
  dependencyVersionIds: string[]
}

/** Identifies the target and scope whose baseline the provider is asked to export. */
export interface ExportEvolutionBaselineRequest {
  context: EvolutionProviderContext
  targetId: string
  scope: EvolutionScope
  /** Specific baseline version requested, if the request identifies one. */
  requestedVersionId?: string
}

/** Baseline artifact together with its provider-supplied version label and pinned dependencies. */
export interface ExportEvolutionBaselineResult {
  artifact: EvolutionArtifactRef
  dependencyVersionIds: string[]
  semanticVersion: string
  providerTraceId: string
}

/** Structural validation outcome. Warnings can accompany a valid artifact; validity does not imply a passing replay. */
export interface CandidateValidationResult {
  valid: boolean
  failureCodes: string[]
  warnings: string[]
}
