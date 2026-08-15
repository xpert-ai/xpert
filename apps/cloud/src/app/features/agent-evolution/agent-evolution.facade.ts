import { Injectable, computed, inject, signal } from '@angular/core'
import { getErrorMessage, injectToastr } from '@cloud/app/@core'
import type {
  CreateDatasetSnapshotRequest,
  DatasetSnapshot,
  EvolutionCandidate,
  EvolutionJob,
  EvolutionPage,
  ImprovementProposal,
  LearningEvent,
  ReleasePackage
} from '@xpert-ai/contracts'
import { TranslateService } from '@ngx-translate/core'
import { firstValueFrom } from 'rxjs'
import { AgentEvolutionApiService } from './agent-evolution-api.service'
import { EMPTY_EVOLUTION_DASHBOARD, sameEvolutionScope, type AgentEvolutionDashboard } from './agent-evolution.types'

const EMPTY_PAGE = { items: [], total: 0, page: 1, pageSize: 20 }

const EVOLUTION_ERROR_I18N_KEYS: Record<string, string> = {
  'Proposal requires three L2+ events across two subjects within 90 days':
    'XP.AgentEvolution.Error.ProposalEvidenceGate'
}

@Injectable({ providedIn: 'root' })
export class AgentEvolutionFacade {
  readonly #api = inject(AgentEvolutionApiService)
  readonly #toastr = injectToastr()
  readonly #translate = inject(TranslateService)
  #scopeRevision = 0
  #loadRevision = 0

  readonly dashboard = signal<AgentEvolutionDashboard>(EMPTY_EVOLUTION_DASHBOARD)
  readonly eventPage = signal<EvolutionPage<LearningEvent>>(EMPTY_PAGE)
  readonly candidatePage = signal<EvolutionPage<EvolutionCandidate>>(EMPTY_PAGE)
  readonly releasePage = signal<EvolutionPage<ReleasePackage>>(EMPTY_PAGE)
  readonly loading = signal(false)
  readonly synchronizing = signal(false)
  readonly mutating = signal(false)
  readonly error = signal<string | null>(null)
  readonly activeJob = signal<EvolutionJob | null>(null)
  readonly loadedAt = signal<Date | null>(null)
  readonly selectedTargetId = signal('all')
  readonly showFixtures = signal(false)
  readonly selectedCandidateId = signal<string | null>(null)
  readonly selectedDatasetSnapshotId = signal<string | null>(null)
  readonly selectedEvaluationRunId = signal<string | null>(null)
  readonly selectedReleasePackageId = signal<string | null>(null)

  readonly visibleTargets = computed(() =>
    this.dashboard().targets.filter((target) => this.showFixtures() || target.targetType !== 'test_fixture')
  )
  readonly selectedTarget = computed(
    () => this.visibleTargets().find((target) => target.targetId === this.selectedTargetId()) ?? null
  )
  readonly contextTargets = computed(() => {
    const targetId = this.selectedTargetId()
    return this.visibleTargets().filter((target) => targetId === 'all' || target.targetId === targetId)
  })
  readonly contextEvents = computed(() => this.dashboard().events.filter((item) => this.matchesContext(item.targetId)))
  readonly contextProposals = computed(() =>
    this.dashboard().proposals.filter((item) => this.matchesContext(item.targetId))
  )
  readonly contextCandidates = computed(() =>
    this.dashboard().candidates.filter((item) => this.matchesContext(item.targetId))
  )
  readonly contextDatasets = computed(() =>
    this.dashboard().datasets.filter((item) => {
      const selectedTargetId = this.selectedTargetId()
      if (!item.targetId) return this.showFixtures() && selectedTargetId === 'all'
      if (
        !this.showFixtures() &&
        this.dashboard().targets.find((target) => target.targetId === item.targetId)?.targetType === 'test_fixture'
      ) {
        return false
      }
      return selectedTargetId === 'all' || item.targetId === selectedTargetId
    })
  )
  readonly contextEvaluations = computed(() => {
    const candidateIds = new Set(this.contextCandidates().map((item) => item.candidateId))
    return this.dashboard().evaluations.filter((item) => candidateIds.has(item.candidateId))
  })
  readonly contextReleases = computed(() =>
    this.dashboard().releases.filter((item) => this.matchesContext(item.targetId))
  )
  readonly contextPointers = computed(() =>
    this.dashboard().pointers.filter((item) => this.matchesContext(item.targetId))
  )
  readonly latestCandidate = computed(
    () =>
      this.contextCandidates().find((item) => item.candidateId === this.selectedCandidateId()) ??
      this.contextCandidates()[0] ??
      null
  )
  readonly latestEvaluation = computed(() => {
    const candidate = this.latestCandidate()
    const evaluations = this.contextEvaluations().filter(
      (item) => !candidate || item.candidateId === candidate.candidateId
    )
    return evaluations.find((item) => item.runId === this.selectedEvaluationRunId()) ?? evaluations[0] ?? null
  })
  readonly latestRelease = computed(
    () =>
      this.contextReleases().find((item) => item.releasePackageId === this.selectedReleasePackageId()) ??
      this.contextReleases()[0] ??
      null
  )
  readonly latestProposal = computed(() => this.contextProposals()[0] ?? null)
  readonly isEmpty = computed(
    () => !this.contextEvents().length && !this.contextCandidates().length && !this.contextReleases().length
  )

  resetScopeContext() {
    this.#scopeRevision++
    this.#loadRevision++
    this.dashboard.set(EMPTY_EVOLUTION_DASHBOARD)
    this.eventPage.set(EMPTY_PAGE)
    this.candidatePage.set(EMPTY_PAGE)
    this.releasePage.set(EMPTY_PAGE)
    this.activeJob.set(null)
    this.selectedTargetId.set('all')
    this.clearResourceSelections()
    this.loadedAt.set(null)
    this.error.set(null)
  }

  async load(options: { silent?: boolean } = {}) {
    const scopeRevision = this.#scopeRevision
    const loadRevision = ++this.#loadRevision
    if (!options.silent) this.loading.set(true)
    this.error.set(null)
    try {
      const [
        dashboard,
        targets,
        versions,
        bundles,
        pointers,
        events,
        diagnoses,
        clusters,
        proposals,
        experiences,
        candidates,
        datasets,
        evaluations,
        releases,
        deployments
      ] = await Promise.all([
        firstValueFrom(this.#api.getDashboard()),
        firstValueFrom(this.#api.listTargets({ page: 1, pageSize: 100 })),
        firstValueFrom(this.#api.listCapabilityVersions({ page: 1, pageSize: 100 })),
        firstValueFrom(this.#api.listCapabilityBundles({ page: 1, pageSize: 100 })),
        firstValueFrom(this.#api.listActivePointers({ page: 1, pageSize: 100 })),
        firstValueFrom(this.#api.listLearningEvents({ page: 1, pageSize: 50 })),
        firstValueFrom(this.#api.listDiagnoses({ page: 1, pageSize: 50 })),
        firstValueFrom(this.#api.listClusters({ page: 1, pageSize: 50 })),
        firstValueFrom(this.#api.listProposals({ page: 1, pageSize: 50 })),
        firstValueFrom(this.#api.listExperiences({ page: 1, pageSize: 50 })),
        firstValueFrom(this.#api.listCandidates({ page: 1, pageSize: 50 })),
        firstValueFrom(this.#api.listDatasets({ page: 1, pageSize: 50 })),
        firstValueFrom(this.#api.listEvaluations({ page: 1, pageSize: 50 })),
        firstValueFrom(this.#api.listReleases({ page: 1, pageSize: 50 })),
        firstValueFrom(this.#api.listDeployments({ page: 1, pageSize: 100 }))
      ])
      if (scopeRevision !== this.#scopeRevision || loadRevision !== this.#loadRevision) return null
      this.eventPage.set(events)
      this.candidatePage.set(candidates)
      this.releasePage.set(releases)
      this.dashboard.set({
        ...EMPTY_EVOLUTION_DASHBOARD,
        ...dashboard,
        targets: targets.items,
        versions: versions.items,
        bundles: bundles.items,
        pointers: pointers.items,
        events: events.items,
        diagnoses: diagnoses.items,
        clusters: clusters.items,
        proposals: proposals.items,
        experiences: experiences.items,
        candidates: candidates.items,
        datasets: datasets.items,
        evaluations: evaluations.items,
        releases: releases.items,
        deployments: deployments.items
      })
      this.normalizeSelections()
      this.loadedAt.set(new Date())
      return dashboard
    } catch (error) {
      if (scopeRevision !== this.#scopeRevision || loadRevision !== this.#loadRevision) return null
      this.reportError(error, !options.silent)
      return null
    } finally {
      if (!options.silent && scopeRevision === this.#scopeRevision && loadRevision === this.#loadRevision) {
        this.loading.set(false)
      }
    }
  }

  async loadLearningEvents(query: { page?: number; search?: string; targetId?: string; status?: string } = {}) {
    const scopeRevision = this.#scopeRevision
    try {
      const result = await firstValueFrom(this.#api.listLearningEvents({ pageSize: 50, ...query }))
      if (scopeRevision !== this.#scopeRevision) return null
      this.eventPage.set(result)
      this.dashboard.update((current) => ({ ...current, events: result.items }))
      return result
    } catch (error) {
      if (scopeRevision !== this.#scopeRevision) return null
      this.reportError(error)
      return null
    }
  }

  async synchronize() {
    this.synchronizing.set(true)
    this.error.set(null)
    try {
      await firstValueFrom(this.#api.synchronizeTargets())
      await this.load({ silent: true })
      this.#toastr.success('XP.AgentEvolution.TargetsSynchronized', { Default: '进化目标与基线版本已同步' })
      return true
    } catch (error) {
      this.reportError(error)
      return false
    } finally {
      this.synchronizing.set(false)
    }
  }

  async reviewEvent(eventId: string, reviewStatus: 'pending' | 'ignored' | 'golden') {
    return this.withMutation(async () => {
      await firstValueFrom(this.#api.reviewLearningEvent(eventId, { reviewStatus }))
      await this.load({ silent: true })
      this.#toastr.success('XP.AgentEvolution.LearningEventUpdated', { Default: '学习信号状态已持久化' })
      return true
    })
  }

  async createProposalForEvent(event: LearningEvent) {
    const evidence = this.dashboard().events.filter(
      (item) =>
        item.targetId === event.targetId &&
        sameEvolutionScope(item.scope, event.scope) &&
        item.reviewStatus !== 'ignored' &&
        item.trustLevel !== 'L1'
    )
    return this.withMutation(async () => {
      const analysis = await firstValueFrom(this.#api.diagnose(evidence.map((item) => item.eventId)))
      const cluster = analysis.clusters.find((item) => item.eventIds.includes(event.eventId))
      const diagnosis = analysis.diagnoses.find((item) => item.eventIds.includes(event.eventId))
      const proposal = await firstValueFrom(
        this.#api.createProposal({
          targetId: event.targetId,
          scope: event.scope,
          eventIds: cluster?.eventIds ?? evidence.map((item) => item.eventId),
          title: this.#translate.instant('XP.AgentEvolution.ImprovementProposalTitle', {
            targetId: event.targetId
          }),
          problemStatement: event.predictionSummary,
          rootCause: diagnosis?.rootCause ?? (event.reasonCodes.join(', ') || 'unclassified'),
          changeHypothesis: this.#translate.instant('XP.AgentEvolution.ProposalHypothesis'),
          riskLevel: this.dashboard().targets.find((item) => item.targetId === event.targetId)?.riskLevel ?? 'R2'
        })
      )
      this.dashboard.update((current) => ({
        ...current,
        proposals: [proposal, ...current.proposals],
        diagnoses: [...analysis.diagnoses, ...current.diagnoses],
        clusters: [...analysis.clusters, ...current.clusters]
      }))
      this.#toastr.success('XP.AgentEvolution.ProposalCreated', { Default: '改进建议已创建，尚未影响生产版本' })
      return proposal
    })
  }

  async buildCandidate(proposal: ImprovementProposal, changeSet: Record<string, string | number | boolean | string[]>) {
    return this.withMutation(async () => {
      const candidate = await firstValueFrom(
        this.#api.buildCandidate({
          proposalId: proposal.proposalId,
          proposalRevision: proposal.revision,
          changeSet
        })
      )
      await this.load({ silent: true })
      this.selectedCandidateId.set(candidate.candidateId)
      return candidate
    })
  }

  async createDataset(request: CreateDatasetSnapshotRequest) {
    return this.withMutation(async () => {
      const dataset = await firstValueFrom(this.#api.createDataset(request))
      await this.load({ silent: true })
      this.selectedDatasetSnapshotId.set(dataset.snapshotId)
      this.#toastr.success('XP.AgentEvolution.DatasetSnapshotCreated')
      return dataset
    })
  }

  async evaluateCandidate(candidate: EvolutionCandidate | null, dataset: DatasetSnapshot | null) {
    if (!candidate || !dataset || candidate.status !== 'ready') {
      this.#toastr.warning('XP.AgentEvolution.EvaluationPrerequisitesMissing', {
        Default: '请选择同一 Target/Scope 的 Ready Candidate 和 Golden Dataset Snapshot'
      })
      return null
    }
    if (dataset.targetId !== candidate.targetId || !sameEvolutionScope(dataset.scope, candidate.targetScope)) {
      this.#toastr.warning('XP.AgentEvolution.CandidateDatasetScopeMismatch')
      return null
    }
    return this.withMutation(async () => {
      const job = await firstValueFrom(
        this.#api.evaluateCandidate({ candidateId: candidate.candidateId, datasetSnapshotId: dataset.snapshotId })
      )
      await this.waitForJob(job)
      await this.load({ silent: true })
      const evaluation = this.dashboard().evaluations.find((item) => item.candidateId === candidate.candidateId)
      this.selectedEvaluationRunId.set(evaluation?.runId ?? null)
      return job
    })
  }

  async evaluateLatestCandidate() {
    const candidate = this.latestCandidate()
    const dataset =
      this.contextDatasets().find((item) => item.snapshotId === this.selectedDatasetSnapshotId()) ??
      this.contextDatasets()[0] ??
      null
    return this.evaluateCandidate(candidate, dataset)
  }

  async approveCandidate(candidateId: string, evaluationRunId: string, reason: string) {
    return this.decideCandidate(candidateId, evaluationRunId, 'approved', reason)
  }

  async rejectCandidate(candidateId: string, evaluationRunId: string, reason: string) {
    return this.decideCandidate(candidateId, evaluationRunId, 'rejected', reason)
  }

  private async decideCandidate(
    candidateId: string,
    evaluationRunId: string,
    decision: 'approved' | 'rejected',
    reason: string
  ) {
    return this.withMutation(async () => {
      const approval = await firstValueFrom(
        this.#api.decideApproval(candidateId, { evaluationRunId, decision, reason })
      )
      await this.load({ silent: true })
      return approval
    })
  }

  async packageRelease(candidateId: string, evaluationRunId: string, approvalIds: string[]) {
    return this.withMutation(async () => {
      const release = await firstValueFrom(
        this.#api.createReleasePackage({ candidateId, evaluationRunId, approvalIds })
      )
      await this.load({ silent: true })
      this.selectedReleasePackageId.set(release.releasePackageId)
      return release
    })
  }

  async runReleaseAction(release: ReleasePackage) {
    return this.withMutation(async () => {
      let job: EvolutionJob | null = null
      if (release.status === 'approved') job = await firstValueFrom(this.#api.installRelease(release.releasePackageId))
      else if (release.status === 'installed')
        job = await firstValueFrom(this.#api.startShadow(release.releasePackageId))
      else if (release.status === 'shadow') {
        job = await firstValueFrom(this.#api.startCanary(release.releasePackageId, { canaryPercent: 5 }))
      } else if (release.status === 'canary' && release.canaryPercent < 50) {
        job = await firstValueFrom(
          this.#api.startCanary(release.releasePackageId, { canaryPercent: release.canaryPercent === 5 ? 25 : 50 })
        )
      } else if (release.status === 'canary') {
        await firstValueFrom(this.#api.activateRelease(release.releasePackageId))
      } else if (release.status === 'active') {
        await firstValueFrom(this.#api.createExperience(release.releasePackageId))
      }
      if (job) await this.waitForJob(job)
      await this.load({ silent: true })
      return job
    })
  }

  async pauseRelease(releasePackageId: string) {
    return this.withMutation(async () => {
      await firstValueFrom(this.#api.pauseRelease(releasePackageId))
      await this.load({ silent: true })
      return true
    })
  }

  async rollbackRelease(releasePackageId: string) {
    return this.withMutation(async () => {
      const job = await firstValueFrom(this.#api.rollbackRelease(releasePackageId))
      await this.waitForJob(job)
      await this.load({ silent: true })
      return true
    })
  }

  private async waitForJob(initial: EvolutionJob) {
    this.activeJob.set(initial)
    for (let attempt = 0; attempt < 60; attempt++) {
      const job = await firstValueFrom(this.#api.getJob(initial.jobId))
      if (!job) throw new Error('Evolution job disappeared')
      this.activeJob.set(job)
      if (job.status === 'completed') return job
      if (job.status === 'failed' || job.status === 'cancelled') {
        throw new Error(job.errorMessage || `Evolution job ${job.status}`)
      }
      await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 1000))
    }
    throw new Error('Evolution job did not finish within 60 seconds')
  }

  selectTarget(targetId: string) {
    this.selectedTargetId.set(targetId)
    this.clearResourceSelections()
  }

  private matchesContext(targetId: string) {
    const selectedTargetId = this.selectedTargetId()
    if (selectedTargetId !== 'all' && targetId !== selectedTargetId) return false
    if (
      !this.showFixtures() &&
      this.dashboard().targets.find((item) => item.targetId === targetId)?.targetType === 'test_fixture'
    ) {
      return false
    }
    return true
  }

  private normalizeSelections() {
    if (
      this.selectedTargetId() !== 'all' &&
      !this.visibleTargets().some((target) => target.targetId === this.selectedTargetId())
    ) {
      this.selectTarget('all')
    }
  }

  private clearResourceSelections() {
    this.selectedCandidateId.set(null)
    this.selectedDatasetSnapshotId.set(null)
    this.selectedEvaluationRunId.set(null)
    this.selectedReleasePackageId.set(null)
  }

  private async withMutation<T>(operation: () => Promise<T>): Promise<T | null> {
    this.mutating.set(true)
    this.error.set(null)
    try {
      return await operation()
    } catch (error) {
      this.reportError(error)
      return null
    } finally {
      this.mutating.set(false)
    }
  }

  private reportError(error: unknown, toast = true) {
    const rawMessage = getErrorMessage(error)
    const message = EVOLUTION_ERROR_I18N_KEYS[rawMessage]
      ? this.#translate.instant(EVOLUTION_ERROR_I18N_KEYS[rawMessage])
      : rawMessage
    this.error.set(message)
    if (toast) this.#toastr.error(message)
  }
}
