import { stageEvidence } from './stage-evidence'
import { ReleaseDetailsComponent } from './release-details.component'
import { ReleaseTrendComponent } from './release-trend.component'
import { CommonModule } from '@angular/common'
import { Component, computed, DestroyRef, effect, inject, signal, untracked } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { ActivatedRoute, Router, RouterLink } from '@angular/router'
import { firstValueFrom, map } from 'rxjs'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { Store, AIPermissionsEnum } from '@cloud/app/@core'
import { injectActiveScope } from '@cloud/app/@core/state'
import {
  ZardAlertDialogService,
  ZardButtonComponent,
  ZardComboboxComponent,
  ZardInputDirective,
  ZardMenuImports,
  ZardSearchInputComponent
} from '@xpert-ai/headless-ui'
import type {
  ReleaseDeployment,
  EvolutionAuditEvent,
  EvolutionRuntimeObservation,
  EvolutionCanaryTestOverride,
  EvolutionLifecycleRecord
} from '@xpert-ai/contracts'
import { AgentEvolutionFacade } from '../agent-evolution.facade'
import { AgentEvolutionApiService } from '../agent-evolution-api.service'
import { isEvolutionAdministratorRole, sameEvolutionScope } from '../agent-evolution.types'
import { EvolutionChangePanelComponent } from '../changes/change-panel.component'
import { evolutionEntries, selectedReplayEvaluation } from '../shared/evolution-change-presentation'
import { loadAllEvolutionPages } from '../shared/evolution-pagination'
import { targetLabel } from '../targets/target-directory'
import { compactId } from '../evaluation/replay-presentation'
import {
  productionPointer,
  isServing,
  reviewedCorrect,
  canaryAttribution,
  nextReleaseStep
} from './release-presentation'

type View = 'history' | 'directory' | 'observations' | 'audit' | 'test' | 'trend' | 'details'
type LoadStatus = 'loading' | 'ready' | 'error'
const emptyEvidence = {
  rows: [] as EvolutionRuntimeObservation[],
  overrides: null as EvolutionCanaryTestOverride[] | null
}
@Component({
  standalone: true,
  selector: 'xp-agent-evolution-release',
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    TranslateModule,
    ZardButtonComponent,
    ZardComboboxComponent,
    ZardInputDirective,
    ZardSearchInputComponent,
    ...ZardMenuImports,
    EvolutionChangePanelComponent,
    ReleaseTrendComponent,
    ReleaseDetailsComponent
  ],
  templateUrl: './release.component.html',
  host: { class: 'flex min-h-0 min-w-0 flex-1 overflow-hidden' }
})
export class AgentEvolutionReleaseComponent {
  readonly facade = inject(AgentEvolutionFacade)
  private api = inject(AgentEvolutionApiService)
  private scope = injectActiveScope()
  private route = inject(ActivatedRoute)
  private router = inject(Router)
  private translate = inject(TranslateService)
  private dialog = inject(ZardAlertDialogService)
  private destroy = inject(DestroyRef)
  private store = inject(Store)
  readonly q = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap })
  readonly fragment = toSignal(this.route.fragment, { initialValue: this.route.snapshot.fragment })
  readonly lang = toSignal(this.translate.onLangChange)
  readonly prefix = 'XP.AgentEvolution.ReleaseWorkbench.'
  readonly canManage = toSignal(
    this.store.userRolePermissions$.pipe(map(() => this.store.hasPermission(AIPermissionsEnum.EVOLUTION_MANAGE))),
    { initialValue: this.store.hasPermission(AIPermissionsEnum.EVOLUTION_MANAGE) }
  )
  readonly user = toSignal(this.store.user$, { initialValue: this.store.user })
  readonly admin = computed(() => isEvolutionAdministratorRole(this.user()?.role?.name))
  readonly term = signal('')
  readonly pageSize = 8
  readonly auditPage = signal(1)
  readonly observationsPage = signal(1)
  readonly retry = signal(0)
  readonly subject = signal('')
  readonly reason = signal('')
  readonly minutes = signal(30)
  readonly short = compactId
  readonly correct = reviewedCorrect
  readonly view = computed<View>(() => {
    const v = this.q().get('view') || this.fragment()
    return v === 'directory' ||
      v === 'audit' ||
      v === 'observations' ||
      v === 'test' ||
      v === 'trend' ||
      v === 'details'
      ? v
      : 'history'
  })
  readonly entries = computed(() =>
    evolutionEntries(this.facade.contextLifecycleRecords(), this.facade.visibleTargets(), 'release')
  )
  readonly filtered = computed(() => {
    const filter = this.q().get('changeStatus')
    return this.entries().filter((r) => !filter || filter === 'all' || r.publicationStatus === filter)
  })
  readonly directory = computed(() =>
    this.filtered().filter((e) =>
      [e.title, e.id, this.name(e.targetId), this.title(e)]
        .join(' ')
        .toLowerCase()
        .includes(this.term().trim().toLowerCase())
    )
  )
  readonly targetOptions = computed(() => [
    { value: 'all', label: this.t('XP.AgentEvolution.Overview.AllTargets') },
    ...this.facade.visibleTargets().map((t) => ({ value: t.targetId, label: this.name(t.targetId) }))
  ])
  readonly statusOptions = computed(() => [
    { value: 'all', label: this.t(this.prefix + 'AllStatus') },
    ...Array.from(new Set(this.entries().map((r) => r.publicationStatus))).map((s) => ({
      value: s,
      label: this.status(s)
    }))
  ])
  readonly selected = computed(() => {
    const id = this.q().get('changeId'),
      entries = this.filtered()
    if (id) return entries.find((e) => e.id === id) ?? null
    const active = this.facade
      .contextReleases()
      .filter((r) => isServing(r, productionPointer(r, this.facade.contextPointers())))
    return entries.find((e) => active.some((r) => r.releasePackageId === e.releasePackageId)) ?? entries[0] ?? null
  })
  readonly resource = computed(() => this.facade.contextChanges().find((c) => c.changeId === this.selected()?.id))
  readonly release = computed(() =>
    this.facade
      .contextReleases()
      .find((r) => r.releasePackageId === this.selected()?.releasePackageId && r.candidateId === this.selected()?.id)
  )
  readonly target = computed(() => this.facade.visibleTargets().find((t) => t.targetId === this.selected()?.targetId))
  readonly ptr = computed(() => {
    const r = this.release()
    return r ? productionPointer(r, this.facade.contextPointers()) : undefined
  })
  readonly serving = computed(() => {
    const r = this.release()
    return !!r && isServing(r, this.ptr())
  })
  readonly stages = computed(() => {
    const r = this.release()
    return r
      ? this.facade
          .dashboard()
          .deployments.filter((s) => s.releasePackageId === r.releasePackageId && sameEvolutionScope(s.scope, r.scope))
          .sort((a, b) => a.startedAt.localeCompare(b.startedAt) || a.deploymentId.localeCompare(b.deploymentId))
      : []
  })
  readonly production = computed(() =>
    this.stages()
      .filter((s) => s.channel === 'production')
      .at(-1)
  )
  readonly focusStage = computed(() => {
    const id = this.q().get('stage')
    return id ? this.stages().find((s) => s.deploymentId === id) : (this.production() ?? this.stages().at(-1))
  })
  readonly stageOptions = computed(() =>
    this.stages().map((s) => ({ value: s.deploymentId, label: this.stageName(s) + ' · ' + s.sampleCount }))
  )
  readonly experience = computed(() =>
    this.facade.dashboard().experiences.find((e) => e.sourceReleasePackageId === this.release()?.releasePackageId)
  )
  readonly step = computed(() => {
    const r = this.release()
    return r ? nextReleaseStep(r, this.stages(), this.ptr(), this.target(), !!this.experience(), Date.now()) : null
  })
  readonly run = computed(() =>
    selectedReplayEvaluation(
      this.facade.dashboard().evaluations,
      this.resource()?.evaluation,
      this.release()?.candidateId
    )
  )
  readonly busy = computed(
    () => this.facade.mutating() || this.facade.releaseJobPending(this.release()?.releasePackageId ?? '')
  )
  readonly job = computed(() => {
    const j = this.facade.activeJob()
    return j?.resourceId && j.resourceId === this.release()?.releasePackageId ? j : null
  })
  readonly allowStep = computed(
    () =>
      this.canManage() &&
      (this.release()?.gatePolicy?.profile !== 'manual_test' || this.admin() || this.step()?.command === 'install')
  )
  readonly canReadTestHistory = computed(() => this.admin() && this.release()?.gatePolicy?.profile === 'manual_test')
  readonly allowTest = computed(
    () => this.canManage() && this.canReadTestHistory() && this.release()?.status === 'canary'
  )
  readonly allowRollback = computed(
    () =>
      this.canManage() &&
      this.serving() &&
      !!this.target()?.capabilities.rollback &&
      !!this.release()?.rollbackVersionId &&
      (!this.ptr()?.rollbackVersionId || this.release()?.rollbackVersionId === this.ptr()?.rollbackVersionId)
  )
  readonly allowPause = computed(() => this.canManage() && ['shadow', 'canary'].includes(this.release()?.status ?? ''))
  readonly testValid = computed(
    () =>
      this.allowTest() &&
      !!this.subject().trim() &&
      !!this.reason().trim() &&
      Number.isInteger(this.minutes()) &&
      this.minutes() >= 1 &&
      this.minutes() <= 120
  )
  readonly evidence = signal(emptyEvidence)
  readonly evidenceStatus = signal<LoadStatus>('loading')
  readonly audits = signal({ items: [] as EvolutionAuditEvent[], total: 0 })
  readonly auditStatus = signal<LoadStatus>('loading')
  readonly stageSources = computed(() => {
    const stage = this.focusStage(),
      release = this.release()
    return stage && release ? stageEvidence(stage, release, this.evidence().rows, this.evidence().overrides) : null
  })
  readonly stageRows = computed(() => this.stageSources()?.rows.map((entry) => entry.row) ?? [])
  readonly visibleRows = computed(() =>
    this.stageRows().slice((this.observationsPage() - 1) * this.pageSize, this.observationsPage() * this.pageSize)
  )
  readonly half = computed(() => {
    const s = this.stages()
      .filter((i) => i.channel === 'canary' && i.canaryPercent === 50)
      .at(-1)
    return s && this.release() && this.evidenceStatus() === 'ready'
      ? canaryAttribution(s, this.release()!, this.evidence().rows, this.evidence().overrides)
      : null
  })
  readonly evidenceKey = computed(() => {
    const r = this.release()
    return !r || this.view() === 'directory'
      ? ''
      : JSON.stringify([
          this.scope(),
          r.releasePackageId,
          this.facade.loadedAt(),
          this.retry(),
          this.stages().map((s) => [s.deploymentId, s.sampleCount])
        ])
  })
  readonly auditKey = computed(() => {
    const r = this.release()
    return this.view() === 'audit' && r
      ? JSON.stringify([
          this.scope(),
          r.releasePackageId,
          this.auditPage(),
          this.facade.loadedAt(),
          this.retry(),
          r.status,
          this.stages().map((s) => s.sampleCount)
        ])
      : ''
  })
  readonly selectedId = computed(() => this.selected()?.id)
  readonly focusedId = computed(() => this.focusStage()?.deploymentId)
  constructor() {
    effect(() => {
      const target = this.q().get('target')
      untracked(() => {
        if (target && target !== this.facade.selectedTargetId()) this.facade.selectTarget(target)
      })
    })
    effect(() => {
      this.scope()
      this.selectedId()
      untracked(() => {
        this.auditPage.set(1)
        this.subject.set('')
        this.reason.set('')
        this.minutes.set(30)
      })
    })
    effect(() => {
      this.focusedId()
      untracked(() => this.observationsPage.set(1))
    })
    effect((cleanup) => {
      const key = this.evidenceKey()
      let alive = true
      cleanup(() => (alive = false))
      untracked(async () => {
        this.evidenceStatus.set('loading')
        this.evidence.set(emptyEvidence)
        const r = this.release()
        if (!key || !r) return
        try {
          const [rows, overrides] = await Promise.all([
            loadAllEvolutionPages((page) =>
              firstValueFrom(
                this.api.listReleaseObservations({
                  releasePackageId: r.releasePackageId,
                  targetId: r.targetId,
                  page,
                  pageSize: 100
                })
              )
            ),
            firstValueFrom(this.api.listCanaryTestOverrides(r.releasePackageId)).catch(() => null)
          ])
          if (alive && key === this.evidenceKey()) {
            this.evidence.set({ rows: rows.filter((o) => sameEvolutionScope(o.scope, r.scope)), overrides })
            this.evidenceStatus.set('ready')
          }
        } catch {
          if (alive) this.evidenceStatus.set('error')
        }
      })
    })
    effect((cleanup) => {
      const key = this.auditKey()
      let alive = true
      cleanup(() => (alive = false))
      untracked(async () => {
        this.auditStatus.set('loading')
        this.audits.set({ items: [], total: 0 })
        const r = this.release()
        if (!key || !r) return
        try {
          const p = await firstValueFrom(
            this.api.listReleaseAudits({
              releasePackageId: r.releasePackageId,
              targetId: r.targetId,
              page: this.auditPage(),
              pageSize: this.pageSize
            })
          )
          if (alive && key === this.auditKey()) {
            this.audits.set(p)
            this.auditStatus.set('ready')
          }
        } catch {
          if (alive) this.auditStatus.set('error')
        }
      })
    })
  }
  t(key: string, vars?: Record<string, unknown>): string {
    this.lang()
    return this.translate.instant(key, vars)
  }
  name(id: string) {
    this.lang()
    const t = this.facade.visibleTargets().find((t) => t.targetId === id)
    return t ? targetLabel(t, this.translate.currentLang) : id
  }
  title(record: EvolutionLifecycleRecord) {
    const c = this.facade.dashboard().candidates.find((c) => c.candidateId === record.id)
    return (
      this.facade
        .contextProposals()
        .find((p) => c && p.proposalId === c.proposalId && p.revision === c.proposalRevision)?.title ||
      record.presentation?.title ||
      record.title
    )
  }
  status(s: string) {
    if (['preparing', 'review', 'publishing', 'published', 'closed', 'blocked'].includes(s))
      return this.t(this.prefix + 'state_' + s)
    return this.t('XP.AgentEvolution.Status.' + s, { Default: s })
  }
  auditSummary(a: EvolutionAuditEvent) {
    if (a.action === 'canary.manual_test_override_created')
      return this.t('XP.AgentEvolution.CanaryTestOverrideCreatedAuditSummary', {
        subjectKey: a.metadata?.subjectKey ?? '—',
        reason: a.metadata?.reason ?? '—'
      })
    if (a.action === 'canary.manual_test_override_consumed')
      return this.t('XP.AgentEvolution.CanaryTestOverrideConsumedAuditSummary', {
        subjectKey: a.metadata?.subjectKey ?? '—',
        executionId: a.metadata?.executionId ?? '—'
      })
    return a.summary
  }
  stageName(s: ReleaseDeployment) {
    return s.channel === 'canary'
      ? this.t(this.prefix + 'Canary', { n: s.canaryPercent })
      : this.t(this.prefix + (s.channel === 'production' ? 'Production' : 'Shadow'))
  }
  version(id: string | undefined) {
    if (!id) return '—'
    const v = this.facade.dashboard().versions.find((v) => v.versionId === id)
    return compactId(v?.semanticVersion || id.split(':').at(-1) || id)
  }
  hitSource(o: EvolutionRuntimeObservation) {
    return this.stageSources()?.rows.find((entry) => entry.row.observationId === o.observationId)?.source ?? 'unknown'
  }
  toggleRetry() {
    this.retry.update((n) => n + 1)
  }
  goto(view: View, id = this.selected()?.id, stage: string | null = null) {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { changeId: id ?? null, view: view === 'history' ? null : view, stage },
      queryParamsHandling: 'merge'
    })
  }
  selectTarget(id: string | null) {
    this.facade.selectTarget(id || 'all')
    this.term.set('')
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { target: id === 'all' ? null : id, view: this.view() === 'directory' ? 'directory' : null }
    })
  }
  filterStatus(s: string | null) {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { changeStatus: s || 'all', view: 'directory', changeId: null, stage: null },
      queryParamsHandling: 'merge'
    })
  }
  private identity() {
    const r = this.release()
    return JSON.stringify([
      this.scope(),
      r?.releasePackageId,
      r?.status,
      r?.canaryPercent,
      this.ptr()?.revision,
      this.view()
    ])
  }
  async command(action: 'next' | 'pause' | 'rollback' | 'test') {
    const r = this.release(),
      step = this.step(),
      identity = this.identity(),
      subject = this.subject().trim(),
      reason = this.reason().trim(),
      minutes = this.minutes()
    const allowed = () =>
      !this.busy() &&
      (action === 'next'
        ? !!step && this.allowStep() && this.step()?.command === step.command && !this.step()?.reason
        : action === 'pause'
          ? this.allowPause()
          : action === 'rollback'
            ? this.allowRollback()
            : this.testValid())
    if (!r || !allowed()) return
    const key = action === 'next' ? step!.command : action
    const label = this.t(this.prefix + 'action_' + key)
    const ok = await firstValueFrom(
      this.dialog.confirm({
        layout: 'standard',
        title: label,
        description: this.t(this.prefix + 'confirm_' + key, {
          from: this.version(r.targetVersionId),
          to: this.version(r.rollbackVersionId),
          subject,
          target: this.name(r.targetId)
        }),
        actionText: label,
        cancelText: this.t('XP.ACTIONS.Cancel')
      })
    )
    if (!ok || this.destroy.destroyed || identity !== this.identity() || !allowed()) return
    if (action === 'next') await this.facade.runReleaseAction(r, step!.command)
    else if (action === 'pause') await this.facade.pauseRelease(r.releasePackageId)
    else if (action === 'rollback') await this.facade.rollbackRelease(r.releasePackageId)
    else if (
      await this.facade.createCanaryTestOverride(r.releasePackageId, {
        subjectKey: subject,
        reason,
        expiresInMinutes: minutes
      })
    ) {
      this.subject.set('')
      this.reason.set('')
      this.minutes.set(30)
      this.toggleRetry()
    }
  }
}
