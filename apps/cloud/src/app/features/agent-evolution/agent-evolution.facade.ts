import { defaultTargetFilters, type TargetFilters } from './targets/target-directory'
import { Injectable, computed, inject, signal } from '@angular/core'
import { getErrorMessage, injectToastr } from '@cloud/app/@core'
import type {
  CreateDatasetSnapshotRequest,
  CreateEvolutionCanaryTestOverrideRequest,
  DatasetSnapshot,
  EvolutionCandidate,
  EvolutionChange,
  EvolutionLifecycleRecord,
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
import type { ReleaseCommand } from './release/release-presentation'
import { selectedReplayEvaluation } from './shared/evolution-change-presentation'
import { loadAllEvolutionPages } from './shared/evolution-pagination'

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

  readonly lifecycleRecords = signal<EvolutionLifecycleRecord[]>([])
  readonly contextLifecycleRecords = computed(() =>
    this.lifecycleRecords().filter((item) => this.matchesContext(item.targetId))
  )
  readonly changes = signal<EvolutionChange[]>([])
  readonly providerError = signal<string | null>(null)
  readonly dashboard = signal<AgentEvolutionDashboard>(EMPTY_EVOLUTION_DASHBOARD)
  readonly eventPage = signal<EvolutionPage<LearningEvent>>(EMPTY_PAGE)
  readonly candidatePage = signal<EvolutionPage<EvolutionCandidate>>(EMPTY_PAGE)
  readonly releasePage = signal<EvolutionPage<ReleasePackage>>(EMPTY_PAGE)
  readonly loading = signal(false)
  readonly synchronizing = signal(false)
  readonly mutating = signal(false)
  readonly error = signal<string | null>(null)
  readonly pendingReplay = signal<{ candidateId: string; snapshotId: string } | null>(null)
  readonly activeJob = signal<EvolutionJob | null>(null)
  readonly loadedAt = signal<Date | null>(null)
  readonly directoryFilters = signal<TargetFilters>({ ...defaultTargetFilters })
  directoryScrollTop = 0
  overviewScrollTop = 0
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
  readonly contextChanges = computed(() => this.changes().filter((item) => this.matchesContext(item.targetId)))
  readonly contextCandidates = computed(() =>
    this.dashboard().candidates.filter((item) => item.strategy && this.matchesContext(item.targetId))
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
    this.directoryFilters.set({ ...defaultTargetFilters })
    this.directoryScrollTop = 0
    this.overviewScrollTop = 0
    this.#scopeRevision++
    this.#loadRevision++
    this.dashboard.set(EMPTY_EVOLUTION_DASHBOARD)
    this.lifecycleRecords.set([])
    this.changes.set([])
    this.providerError.set(null)
    this.eventPage.set(EMPTY_PAGE)
    this.candidatePage.set(EMPTY_PAGE)
    this.releasePage.set(EMPTY_PAGE)
    this.activeJob.set(null)
    this.pendingReplay.set(null)
    this.selectedTargetId.set('all')
    this.clearResourceSelections()
    this.loadedAt.set(null)
    this.error.set(null)
  }

  async refreshChanges(includeRelease = false) {
    const scopeRevision = this.#scopeRevision
    const loadRevision = this.#loadRevision
    try {
      const activeJob = this.activeJob()
      const [changes, lifecycle, job, runtime] = await Promise.all([
        firstValueFrom(this.#api.listChanges()),
        firstValueFrom(this.#api.listLifecycleRecords()),
        activeJob && ['pending', 'running', 'queued'].includes(activeJob.status)
          ? firstValueFrom(this.#api.getJob(activeJob.jobId))
          : Promise.resolve(null),
        includeRelease
          ? Promise.all([
              loadAllEvolutionPages((page) => firstValueFrom(this.#api.listReleases({ page, pageSize: 100 }))),
              loadAllEvolutionPages((page) => firstValueFrom(this.#api.listDeployments({ page, pageSize: 100 }))),
              loadAllEvolutionPages((page) => firstValueFrom(this.#api.listActivePointers({ page, pageSize: 100 })))
            ])
          : Promise.resolve(null)
      ])
      if (scopeRevision !== this.#scopeRevision || loadRevision !== this.#loadRevision) return
      if (runtime) {
        const [releases, deployments, pointers] = runtime
        this.dashboard.update((d) => ({ ...d, releases, deployments, pointers }))
      }
      this.changes.set(changes)
      this.lifecycleRecords.set(lifecycle.items)
      if (job && this.activeJob()?.jobId === job.jobId) this.activeJob.set(job)
      this.providerError.set(null)
    } catch (error) {
      if (scopeRevision === this.#scopeRevision && loadRevision === this.#loadRevision)
        this.providerError.set(getErrorMessage(error))
    }
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
        deployments,
        providerRecords,
        lifecycle
      ] = await Promise.all([
        firstValueFrom(this.#api.getDashboard()),
        loadAllEvolutionPages((page) => firstValueFrom(this.#api.listTargets({ page, pageSize: 100 }))),
        firstValueFrom(this.#api.listCapabilityVersions({ page: 1, pageSize: 100 })),
        firstValueFrom(this.#api.listCapabilityBundles({ page: 1, pageSize: 100 })),
        loadAllEvolutionPages((page) => firstValueFrom(this.#api.listActivePointers({ page, pageSize: 100 }))),
        firstValueFrom(this.#api.listLearningEvents({ page: 1, pageSize: 50 })),
        firstValueFrom(this.#api.listDiagnoses({ page: 1, pageSize: 50 })),
        firstValueFrom(this.#api.listClusters({ page: 1, pageSize: 50 })),
        loadAllEvolutionPages((page) => firstValueFrom(this.#api.listProposals({ page, pageSize: 50 }))),
        loadAllEvolutionPages((page) => firstValueFrom(this.#api.listExperiences({ page, pageSize: 100 }))),
        loadAllEvolutionPages((page) => firstValueFrom(this.#api.listCandidates({ page, pageSize: 50 }))),
        loadAllEvolutionPages((page) => firstValueFrom(this.#api.listDatasets({ page, pageSize: 50 }))),
        loadAllEvolutionPages((page) => firstValueFrom(this.#api.listEvaluations({ page, pageSize: 50 }))),
        loadAllEvolutionPages((page) => firstValueFrom(this.#api.listReleases({ page, pageSize: 100 }))),
        loadAllEvolutionPages((page) => firstValueFrom(this.#api.listDeployments({ page, pageSize: 100 }))),
        firstValueFrom(this.#api.listChanges())
          .then((value) => ({ value, error: null }))
          .catch((error) => ({ value: [], error: getErrorMessage(error) })),
        firstValueFrom(this.#api.listLifecycleRecords())
      ])
      if (scopeRevision !== this.#scopeRevision || loadRevision !== this.#loadRevision) return null
      this.lifecycleRecords.set(lifecycle.items)
      this.changes.set(providerRecords.value)
      this.providerError.set(providerRecords.error)
      this.eventPage.set(events)
      this.candidatePage.set({ items: candidates, total: candidates.length, page: 1, pageSize: candidates.length })
      this.releasePage.set({ items: releases, total: releases.length, page: 1, pageSize: 100 })
      this.dashboard.set({
        ...EMPTY_EVOLUTION_DASHBOARD,
        ...dashboard,
        targets,
        versions: versions.items,
        bundles: bundles.items,
        pointers,
        events: events.items,
        diagnoses: diagnoses.items,
        clusters: clusters.items,
        proposals,
        experiences,
        candidates,
        datasets,
        evaluations,
        releases,
        deployments
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
      this.#toastr.success('XP.AgentEvolution.TargetsSynchronized', {
        Default: 'Evolution targets and baseline versions synchronized'
      })
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
      this.#toastr.success('XP.AgentEvolution.LearningEventUpdated', { Default: 'Learning event review status saved' })
      return true
    })
  }

  async buildCandidate(proposal: ImprovementProposal, changeSet: Record<string, string | number | boolean | string[]>) {
    if (this.mutating()) return null
    const scope = this.#scopeRevision
    return this.withMutation(async () => {
      const candidate = await firstValueFrom(
        this.#api.buildCandidate({
          proposalId: proposal.proposalId,
          proposalRevision: proposal.revision,
          changeSet
        })
      )
      if (scope !== this.#scopeRevision) return null
      await this.load({ silent: true })
      if (scope !== this.#scopeRevision) return null
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
    if (!candidate || !dataset || !['ready', 'evaluating'].includes(candidate.status)) {
      this.#toastr.warning('XP.AgentEvolution.EvaluationPrerequisitesMissing', {
        Default: 'Select a Ready Candidate and Golden Dataset Snapshot with the same Target/Scope'
      })
      return null
    }
    if (dataset.targetId !== candidate.targetId || !sameEvolutionScope(dataset.scope, candidate.targetScope)) {
      this.#toastr.warning('XP.AgentEvolution.CandidateDatasetScopeMismatch')
      return null
    }
    const step = candidate.strategy.definition.evaluations.find((item) => item.kind === 'golden_replay')
    const current = this.contextChanges().find((item) => item.changeId === candidate.candidateId)
    if (!step || !current || current.evaluation || this.mutating() || this.pendingReplay()) return null
    const scope = this.#scopeRevision
    this.pendingReplay.set({ candidateId: candidate.candidateId, snapshotId: dataset.snapshotId })
    try {
      return await this.withMutation(async () => {
        // The evaluate endpoint returns the committed assessment. Only its evidence identifies this replay.
        const record = await firstValueFrom(
          this.#api.evaluateChange(candidate.candidateId, {
            ...current.datasetSnapshotIds,
            [step.key]: dataset.snapshotId
          })
        )
        if (scope !== this.#scopeRevision) return null
        await this.load({ silent: true })
        if (scope !== this.#scopeRevision) return null
        const run = selectedReplayEvaluation(
          this.dashboard().evaluations.filter((item) => item.datasetSnapshotId === dataset.snapshotId),
          record.evaluation,
          candidate.candidateId
        )
        if (!run) throw new Error(this.#translate.instant('XP.AgentEvolution.ReplayWorkbench.MissingResult'))
        this.selectedEvaluationRunId.set(run.runId)
        return run
      })
    } finally {
      if (scope === this.#scopeRevision) this.pendingReplay.set(null)
    }
  }

  async evaluateLatestCandidate() {
    const candidate = this.latestCandidate()
    const dataset = this.contextDatasets().find((item) => item.snapshotId === this.selectedDatasetSnapshotId()) ?? null
    return this.evaluateCandidate(candidate, dataset)
  }

  async approveCandidate(candidateId: string, evaluationRunId: string, reason: string) {
    return this.decideCandidate(candidateId, evaluationRunId, 'approved', reason)
  }

  async approveAndPublishChange(change: EvolutionChange, reason: string) {
    const { candidate, evaluation } = change
    if (
      this.mutating() ||
      change.strategy.definition.publication.mode !== 'version_write' ||
      change.status !== 'pending_approval' ||
      !candidate ||
      !evaluation?.passed ||
      !reason.trim()
    )
      return null
    const scopeRevision = this.#scopeRevision
    return this.withMutation(async () => {
      try {
        const approval = await firstValueFrom(
          this.#api.decideChange(change.changeId, {
            candidateHash: candidate.artifact.hash,
            evaluationRunId: evaluation.runId,
            decision: 'approved',
            reason: reason.trim()
          })
        )
        if (scopeRevision !== this.#scopeRevision) return approval
        // The server decides whether all required human approvals are present.
        if (approval.status !== 'approved') {
          if (approval.status === 'pending_approval')
            this.#toastr.info({
              code: 'XP.AgentEvolution.ApprovalRecordedPending',
              default: 'Approval recorded; waiting for the remaining required approvals.'
            })
          return approval
        }
        return await this.publishVersionChange(change.changeId)
      } finally {
        if (scopeRevision === this.#scopeRevision) await this.load({ silent: true })
      }
    })
  }

  async publishApprovedChange(change: EvolutionChange) {
    if (
      this.mutating() ||
      change.strategy.definition.publication.mode !== 'version_write' ||
      !['approved', 'publishing'].includes(change.status) ||
      !change.evaluation?.passed
    )
      return null
    const scopeRevision = this.#scopeRevision
    return this.withMutation(async () => {
      try {
        return await this.publishVersionChange(change.changeId)
      } finally {
        if (scopeRevision === this.#scopeRevision) await this.load({ silent: true })
      }
    })
  }

  private async publishVersionChange(changeId: string) {
    try {
      return await firstValueFrom(this.#api.publishChange(changeId))
    } catch (error) {
      throw new Error(
        this.#translate.instant('XP.AgentEvolution.ApprovedPublicationFailed', { reason: getErrorMessage(error) })
      )
    }
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
        this.#api.decideChange(candidateId, {
          candidateHash:
            this.dashboard().candidates.find((item) => item.candidateId === candidateId)?.artifact.hash ?? '',
          evaluationRunId:
            this.lifecycleRecords().find((item) => item.id === candidateId)?.evaluation?.runId ?? evaluationRunId,
          decision,
          reason
        })
      )
      await this.load({ silent: true })
      return approval
    })
  }

  async packageRelease(candidateId: string, evaluationRunId: string, approvalIds: string[]) {
    if (this.mutating()) return null
    const revision = this.#scopeRevision
    return this.withMutation(async () => {
      const release = await firstValueFrom(this.#api.publishChange(candidateId))
      if (revision !== this.#scopeRevision) return null
      await this.load({ silent: true })
      if (revision !== this.#scopeRevision) return null
      this.selectedReleasePackageId.set(release.releasePackageId ?? null)
      return release
    })
  }

  async runReleaseAction(release: ReleasePackage, command: ReleaseCommand) {
    const id = release.releasePackageId
    if (this.mutating() || this.releaseJobPending(id)) return null
    const revision = this.#scopeRevision
    return this.withMutation(async () => {
      let job: EvolutionJob | undefined
      switch (command) {
        case 'install':
          job = await firstValueFrom(this.#api.installRelease(id))
          break
        case 'shadow':
          job = await firstValueFrom(this.#api.startShadow(id))
          break
        case 'canary5':
        case 'canary25':
        case 'canary50':
          job = await firstValueFrom(
            this.#api.startCanary(id, { canaryPercent: command === 'canary5' ? 5 : command === 'canary25' ? 25 : 50 })
          )
          break
        case 'activate':
          await firstValueFrom(this.#api.activateRelease(id))
          break
        case 'experience':
          await firstValueFrom(this.#api.createExperience(id))
          break
      }
      if (revision !== this.#scopeRevision) return null
      if (job) await this.waitForJob(job, revision)
      if (revision !== this.#scopeRevision) return null
      await this.load({ silent: true })
      return true
    })
  }

  releaseJobPending(id: string) {
    const job = this.activeJob()
    return job?.resourceId === id && (job.status === 'queued' || job.status === 'running')
  }

  async pauseRelease(releasePackageId: string) {
    if (this.mutating() || this.releaseJobPending(releasePackageId)) return null
    const revision = this.#scopeRevision
    return this.withMutation(async () => {
      await firstValueFrom(this.#api.pauseRelease(releasePackageId))
      if (revision !== this.#scopeRevision) return null
      await this.load({ silent: true })
      return true
    })
  }

  async createCanaryTestOverride(releasePackageId: string, request: CreateEvolutionCanaryTestOverrideRequest) {
    if (this.mutating() || this.releaseJobPending(releasePackageId)) return null
    const revision = this.#scopeRevision
    return this.withMutation(async () => {
      const override = await firstValueFrom(this.#api.createCanaryTestOverride(releasePackageId, request))
      if (revision !== this.#scopeRevision) return null
      await this.load({ silent: true })
      this.#toastr.success('XP.AgentEvolution.CanaryTestOverrideCreated')
      return override
    })
  }

  async rollbackRelease(releasePackageId: string) {
    if (this.mutating() || this.releaseJobPending(releasePackageId)) return null
    const revision = this.#scopeRevision
    return this.withMutation(async () => {
      const job = await firstValueFrom(this.#api.rollbackRelease(releasePackageId))
      if (revision !== this.#scopeRevision) return null
      await this.waitForJob(job, revision)
      if (revision !== this.#scopeRevision) return null
      await this.load({ silent: true })
      return true
    })
  }

  private async waitForJob(initial: EvolutionJob, revision: number) {
    this.activeJob.set(initial)
    for (let attempt = 0; attempt < 60; attempt++) {
      if (revision !== this.#scopeRevision) return null
      const job = await firstValueFrom(this.#api.getJob(initial.jobId))
      if (revision !== this.#scopeRevision) return null
      if (!job) throw new Error('Evolution job disappeared')
      this.activeJob.set(job)
      if (job.status === 'completed') return job
      if (job.status === 'failed' || job.status === 'cancelled') {
        throw new Error(job.errorMessage || `Evolution job ${job.status}`)
      }
      await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 1000))
    }
    // The wait window is not a job timeout. Progress continues through background refresh.
    return this.activeJob() ?? initial
  }

  setShowFixtures(value: boolean) {
    const selected = this.dashboard().targets.find((target) => target.targetId === this.selectedTargetId())
    this.showFixtures.set(value)
    if (!value && selected?.targetType === 'test_fixture') this.selectTarget('all')
  }

  selectTarget(targetId: string) {
    this.directoryScrollTop = 0
    this.overviewScrollTop = 0
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
