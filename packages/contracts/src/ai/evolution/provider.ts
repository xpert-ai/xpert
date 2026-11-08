import {
  BuildEvolutionCandidateRequest,
  CandidateBuildResult,
  CandidateValidationResult,
  ExportEvolutionBaselineRequest,
  ExportEvolutionBaselineResult,
  ValidateEvolutionCandidateRequest
} from './candidate'
import { MetricObservation, ReplayCaseRequest, ReplayCaseResult } from './evaluation'
import { ReleaseProviderReceipt, ReleaseProviderRequest } from './release'
import { EvolutionTargetDescriptor } from './target'

/** Owns construction and structural validation of artifacts for a target; neither operation approves a release. */
export interface EvolutionCandidateBuilder {
  /** Produces a candidate from the specified baseline, proposal revision and change inputs. */
  buildCandidate(request: BuildEvolutionCandidateRequest): Promise<CandidateBuildResult>
  /** Checks artifact compatibility with the declared target, baseline and dependencies. */
  validateCandidate(request: ValidateEvolutionCandidateRequest): Promise<CandidateValidationResult>
}

/** Owns the representation of a target's baseline; inspection of source rules is an optional capability. */
export interface EvolutionBaselineExporter extends Partial<import('./baseline').EvolutionBaselineReader> {
  /** Returns the baseline artifact and its exact dependencies for the requested target and scope. */
  exportBaseline(request: ExportEvolutionBaselineRequest): Promise<ExportEvolutionBaselineResult>
}

/** Compares frozen baseline and candidate inputs under the same case without affecting live decisions. */
export interface EvolutionReplayEvaluator {
  /** Returns the baseline and candidate outcomes for the same case revision. */
  runReplayCase(request: ReplayCaseRequest): Promise<ReplayCaseResult>
  /** Reports target-defined measurements and blocking violations for that case result. */
  evaluateResult(request: ReplayCaseRequest, result: ReplayCaseResult): Promise<MetricObservation[]>
}

/** Owns the target-side effects of staged releases. A provider receipt attests only to the requested operation. */
export interface EvolutionReleaseProvider {
  /** Makes the specified version ready for use without declaring it active. */
  install(request: ReleaseProviderRequest): Promise<ReleaseProviderReceipt>
  /** Applies the requested version within the release scope. */
  activate(request: ReleaseProviderRequest): Promise<ReleaseProviderReceipt>
  /** Restores the version specified by the rollback request within the same scope. */
  rollback(request: ReleaseProviderRequest): Promise<ReleaseProviderReceipt>
}

/** Execution projection available for feedback. Outputs retain their target-specific shape and require validation. */
export type EvolutionFeedbackExecution = Pick<
  import('../xpert-agent-execution.model').IXpertAgentExecution,
  'id' | 'threadId' | 'outputs' | 'completedAt' | 'createdAt'
>

/** Optional target adapter that defines the meaning of execution reviews and the cases derived from their evidence. */
export interface EvolutionFeedbackProvider {
  /** Stable feedback route identifier; it must resolve unambiguously within the organization. */
  readonly routeKey: string
  /** Discriminator of execution records this adapter can interpret. */
  readonly executionType: string
  /** Validates untrusted review input against the scoped execution and returns the recorded learning event. */
  review(
    identity: { tenantId: string; organizationId: string },
    execution: EvolutionFeedbackExecution,
    input: unknown
  ): Promise<import('./learning-event').LearningEvent>
  /** Defines replay cases and scoring versions from scoped evidence. Snapshot identity and scope are outside this contribution. */
  dataset(
    events: import('./learning-event').LearningEvent[],
    executions: EvolutionFeedbackExecution[]
  ): Pick<import('./evaluation').DatasetSnapshot, 'name' | 'evaluatorVersion' | 'metricDefinitionVersion' | 'cases'>
}

/** Extension point for one target. Its declared strategies determine which optional builder, evaluator and publisher roles it must provide. */
export interface EvolutionTargetProvider {
  /** Opt-in review of target-specific executions. A target can support evolution without exposing execution feedback. */
  readonly feedback?: EvolutionFeedbackProvider
  /** Declares the target's stable identity and the strategies this implementation supports. */
  readonly descriptor: EvolutionTargetDescriptor
  /** Prepares target-owned change drafts, distinct from building an artifact from a change set. */
  readonly draftBuilder?: Pick<import('./change').EvolutionChangeProvider, 'prepare'>
  /** Performs target-defined checks, distinct from replay against a golden dataset. */
  readonly checkEvaluator?: Pick<import('./change').EvolutionChangeProvider, 'evaluate'>
  /** Owns freshness, authorization and publication for strategies that write a target version directly. */
  readonly versionPublisher?: Pick<
    import('./change').EvolutionChangeProvider,
    'validateCurrent' | 'authorizePublication' | 'publish'
  >
  /** Contributes domain explanations and effect information; presentation does not decide release eligibility. */
  readonly presenter?: Pick<import('./change').EvolutionChangeProvider, 'describe'>
  readonly baselineExporter?: EvolutionBaselineExporter
  readonly candidateBuilder?: EvolutionCandidateBuilder
  readonly replayEvaluator?: EvolutionReplayEvaluator
  readonly releaseProvider?: EvolutionReleaseProvider
}

/** Target provider that may additionally describe multiple evolution targets. */
export interface EvolutionProvider extends EvolutionTargetProvider {
  /** Returns the target descriptors advertised by this provider. */
  describeTargets?(): Promise<EvolutionTargetDescriptor[]> | EvolutionTargetDescriptor[]
}
