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

export interface EvolutionCandidateBuilder {
  buildCandidate(request: BuildEvolutionCandidateRequest): Promise<CandidateBuildResult>
  validateCandidate(request: ValidateEvolutionCandidateRequest): Promise<CandidateValidationResult>
}

export interface EvolutionBaselineExporter {
  exportBaseline(request: ExportEvolutionBaselineRequest): Promise<ExportEvolutionBaselineResult>
}

export interface EvolutionReplayEvaluator {
  runReplayCase(request: ReplayCaseRequest): Promise<ReplayCaseResult>
  evaluateResult(request: ReplayCaseRequest, result: ReplayCaseResult): Promise<MetricObservation[]>
}

export interface EvolutionReleaseProvider {
  install(request: ReleaseProviderRequest): Promise<ReleaseProviderReceipt>
  activate(request: ReleaseProviderRequest): Promise<ReleaseProviderReceipt>
  rollback(request: ReleaseProviderRequest): Promise<ReleaseProviderReceipt>
}

export interface EvolutionTargetProvider {
  readonly descriptor: EvolutionTargetDescriptor
  readonly baselineExporter?: EvolutionBaselineExporter
  readonly candidateBuilder?: EvolutionCandidateBuilder
  readonly replayEvaluator?: EvolutionReplayEvaluator
  readonly releaseProvider?: EvolutionReleaseProvider
}

export interface EvolutionProvider extends EvolutionTargetProvider {
  describeTargets?(): Promise<EvolutionTargetDescriptor[]> | EvolutionTargetDescriptor[]
}
