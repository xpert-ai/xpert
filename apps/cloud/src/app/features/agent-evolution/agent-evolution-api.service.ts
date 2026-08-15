import { HttpClient, HttpParams } from '@angular/common/http'
import { Injectable, inject } from '@angular/core'
import { API_AGENT_EVOLUTION } from '@cloud/app/@core/constants/app.constants'
import type {
  ActiveCapabilityPointer,
  ApprovalDecision,
  BuildCandidateCommand,
  CapabilityVersion,
  CapabilityVersionBundle,
  CreateDatasetSnapshotRequest,
  CreateImprovementProposalRequest,
  CreateReleasePackageRequest,
  DatasetSnapshot,
  DecideCandidateApprovalRequest,
  EvaluateCandidateCommand,
  EvaluationRun,
  EvolutionAnalysisResult,
  EvolutionDiagnosis,
  EvolutionEventCluster,
  EvolutionExperience,
  EvolutionCandidate,
  EvolutionJob,
  EvolutionPage,
  EvolutionPageQuery,
  EvolutionTargetDescriptor,
  ImprovementProposal,
  LearningEvent,
  ReleaseDeployment,
  ReleasePackage,
  ReviewLearningEventRequest,
  StartDeploymentRequest
} from '@xpert-ai/contracts'
import type { AgentEvolutionDashboard } from './agent-evolution.types'

@Injectable({ providedIn: 'root' })
export class AgentEvolutionApiService {
  readonly #http = inject(HttpClient)

  getDashboard() {
    return this.#http.get<AgentEvolutionDashboard>(`${API_AGENT_EVOLUTION}/dashboard`)
  }

  synchronizeTargets() {
    return this.#http.post<EvolutionTargetDescriptor[]>(`${API_AGENT_EVOLUTION}/targets/synchronize`, {})
  }

  listTargets(query: EvolutionPageQuery = {}) {
    return this.#http.get<EvolutionPage<EvolutionTargetDescriptor>>(`${API_AGENT_EVOLUTION}/targets`, {
      params: queryParams(query)
    })
  }

  listCapabilityVersions(query: EvolutionPageQuery = {}) {
    return this.#http.get<EvolutionPage<CapabilityVersion>>(`${API_AGENT_EVOLUTION}/capability-versions`, {
      params: queryParams(query)
    })
  }

  listCapabilityBundles(query: EvolutionPageQuery = {}) {
    return this.#http.get<EvolutionPage<CapabilityVersionBundle>>(`${API_AGENT_EVOLUTION}/capability-bundles`, {
      params: queryParams(query)
    })
  }

  listActivePointers(query: EvolutionPageQuery = {}) {
    return this.#http.get<EvolutionPage<ActiveCapabilityPointer>>(`${API_AGENT_EVOLUTION}/active-pointers`, {
      params: queryParams(query)
    })
  }

  listLearningEvents(query: EvolutionPageQuery = {}) {
    return this.#http.get<EvolutionPage<LearningEvent>>(`${API_AGENT_EVOLUTION}/learning-events`, {
      params: queryParams(query)
    })
  }

  reviewLearningEvent(eventId: string, request: ReviewLearningEventRequest) {
    return this.#http.patch<LearningEvent>(`${API_AGENT_EVOLUTION}/learning-events/${eventId}/review`, request)
  }

  listDiagnoses(query: EvolutionPageQuery = {}) {
    return this.#http.get<EvolutionPage<EvolutionDiagnosis>>(`${API_AGENT_EVOLUTION}/diagnoses`, {
      params: queryParams(query)
    })
  }

  listClusters(query: EvolutionPageQuery = {}) {
    return this.#http.get<EvolutionPage<EvolutionEventCluster>>(`${API_AGENT_EVOLUTION}/clusters`, {
      params: queryParams(query)
    })
  }

  listExperiences(query: EvolutionPageQuery = {}) {
    return this.#http.get<EvolutionPage<EvolutionExperience>>(`${API_AGENT_EVOLUTION}/experiences`, {
      params: queryParams(query)
    })
  }

  createExperience(releasePackageId: string) {
    return this.#http.post<EvolutionExperience>(`${API_AGENT_EVOLUTION}/experiences`, { releasePackageId })
  }

  diagnose(eventIds: string[]) {
    return this.#http.post<EvolutionAnalysisResult>(`${API_AGENT_EVOLUTION}/diagnoses`, { eventIds })
  }

  createProposal(request: CreateImprovementProposalRequest) {
    return this.#http.post<ImprovementProposal>(`${API_AGENT_EVOLUTION}/proposals`, request)
  }

  listProposals(query: EvolutionPageQuery = {}) {
    return this.#http.get<EvolutionPage<ImprovementProposal>>(`${API_AGENT_EVOLUTION}/proposals`, {
      params: queryParams(query)
    })
  }

  listCandidates(query: EvolutionPageQuery = {}) {
    return this.#http.get<EvolutionPage<EvolutionCandidate>>(`${API_AGENT_EVOLUTION}/candidates`, {
      params: queryParams(query)
    })
  }

  buildCandidate(request: BuildCandidateCommand) {
    return this.#http.post<EvolutionCandidate>(`${API_AGENT_EVOLUTION}/candidates`, request)
  }

  decideApproval(candidateId: string, request: DecideCandidateApprovalRequest) {
    return this.#http.post<ApprovalDecision>(`${API_AGENT_EVOLUTION}/candidates/${candidateId}/approvals`, request)
  }

  listDatasets(query: EvolutionPageQuery = {}) {
    return this.#http.get<EvolutionPage<DatasetSnapshot>>(`${API_AGENT_EVOLUTION}/datasets`, {
      params: queryParams(query)
    })
  }

  createDataset(request: CreateDatasetSnapshotRequest) {
    return this.#http.post<DatasetSnapshot>(`${API_AGENT_EVOLUTION}/datasets`, request)
  }

  listEvaluations(query: EvolutionPageQuery = {}) {
    return this.#http.get<EvolutionPage<EvaluationRun>>(`${API_AGENT_EVOLUTION}/evaluations`, {
      params: queryParams(query)
    })
  }

  evaluateCandidate(request: EvaluateCandidateCommand) {
    return this.#http.post<EvolutionJob>(`${API_AGENT_EVOLUTION}/evaluations`, request)
  }

  listReleases(query: EvolutionPageQuery = {}) {
    return this.#http.get<EvolutionPage<ReleasePackage>>(`${API_AGENT_EVOLUTION}/releases`, {
      params: queryParams(query)
    })
  }

  listDeployments(query: EvolutionPageQuery = {}) {
    return this.#http.get<EvolutionPage<ReleaseDeployment>>(`${API_AGENT_EVOLUTION}/deployments`, {
      params: queryParams(query)
    })
  }

  createReleasePackage(request: CreateReleasePackageRequest) {
    return this.#http.post<ReleasePackage>(`${API_AGENT_EVOLUTION}/release-packages`, request)
  }

  installRelease(releasePackageId: string) {
    return this.#http.post<EvolutionJob>(`${API_AGENT_EVOLUTION}/releases/${releasePackageId}/install`, {})
  }

  startShadow(releasePackageId: string) {
    return this.#http.post<EvolutionJob>(`${API_AGENT_EVOLUTION}/releases/${releasePackageId}/shadow`, {})
  }

  startCanary(releasePackageId: string, request: StartDeploymentRequest) {
    return this.#http.post<EvolutionJob>(`${API_AGENT_EVOLUTION}/releases/${releasePackageId}/canary`, request)
  }

  pauseRelease(releasePackageId: string) {
    return this.#http.post<ReleasePackage>(`${API_AGENT_EVOLUTION}/releases/${releasePackageId}/pause`, {})
  }

  activateRelease(releasePackageId: string) {
    return this.#http.post<ActiveCapabilityPointer>(`${API_AGENT_EVOLUTION}/releases/${releasePackageId}/activate`, {})
  }

  rollbackRelease(releasePackageId: string) {
    return this.#http.post<EvolutionJob>(`${API_AGENT_EVOLUTION}/releases/${releasePackageId}/rollback`, {})
  }

  getJob(jobId: string) {
    return this.#http.get<EvolutionJob | null>(`${API_AGENT_EVOLUTION}/jobs/${jobId}`)
  }

  /** Development/test-only conformance fixture. Production workflows use the explicit governance APIs above. */
  simulateConformance() {
    return this.#http.post<import('@xpert-ai/contracts').EvolutionSimulationResult>(
      `${API_AGENT_EVOLUTION}/examples/conformance-field-mapping/run`,
      {}
    )
  }
}

function queryParams(query: EvolutionPageQuery) {
  let params = new HttpParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') params = params.set(key, `${value}`)
  }
  return params
}
