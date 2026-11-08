import { Dialog, DialogRef } from '@angular/cdk/dialog'
import { CommonModule } from '@angular/common'
import { HttpErrorResponse } from '@angular/common/http'
import {
  Component,
  computed,
  effect,
  inject,
  signal,
  TemplateRef,
  untracked,
  viewChild,
  ViewContainerRef
} from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { ActivatedRoute, Router, RouterLink } from '@angular/router'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { XpDialogFrameImports, ZardButtonComponent } from '@xpert-ai/headless-ui'
import type { ReleaseDeployment, ReleasePackage } from '@xpert-ai/contracts'
import { catchError, firstValueFrom, map, of, startWith, switchMap } from 'rxjs'
import { injectActiveScope } from '@cloud/app/@core/state'
import { AgentEvolutionFacade } from '../agent-evolution.facade'
import { AgentEvolutionApiService } from '../agent-evolution-api.service'
import { sameEvolutionScope } from '../agent-evolution.types'
import { findHistoricalDeployment } from '../evolution-resource-lookup'
import { loadAllEvolutionPages } from '../shared/evolution-pagination'
import { targetLabel } from '../targets/target-directory'
import { productionPointer, reviewedCorrect } from './release-presentation'
import { stageEvidence } from './stage-evidence'

type StageLookup = { status: 'loading' | 'ready' | 'missing' | 'denied' | 'failed'; stage?: ReleaseDeployment }
type HitFilter = 'all' | 'natural' | 'specified'

@Component({
  selector: 'xp-deployment-history',
  imports: [CommonModule, TranslateModule, RouterLink, ZardButtonComponent, ...XpDialogFrameImports],
  templateUrl: './deployment-history.component.html',
  host: { class: 'flex min-h-0 min-w-0 flex-1 flex-col bg-background text-foreground' }
})
export class DeploymentHistoryComponent {
  readonly p = 'XP.AgentEvolution.DeploymentHistory.'
  readonly w = 'XP.AgentEvolution.ReleaseWorkbench.'
  readonly facade = inject(AgentEvolutionFacade)
  private readonly api = inject(AgentEvolutionApiService)
  private readonly route = inject(ActivatedRoute)
  private readonly router = inject(Router)
  private readonly i18n = inject(TranslateService)
  private readonly lang = toSignal(this.i18n.onLangChange)
  private readonly activeScope = injectActiveScope()
  private readonly params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap })
  private readonly query = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap })
  private readonly legacy = computed(() => this.params().has('resourceId'))
  readonly id = computed(() => this.params().get('resourceId') ?? this.query().get('stage') ?? '')
  private readonly retryTick = signal(0)
  private readonly request = computed(() => ({ id: this.id(), scope: this.activeScope(), retry: this.retryTick() }))
  private readonly read = toSignal(
    toObservable(this.request).pipe(
      switchMap((request) =>
        findHistoricalDeployment(this.api, request.id).pipe(
          map((stage): StageLookup => (stage ? { status: 'ready', stage } : { status: 'missing' })),
          catchError((error: unknown) =>
            of<StageLookup>({
              status: error instanceof HttpErrorResponse && [401, 403].includes(error.status) ? 'denied' : 'failed'
            })
          ),
          startWith<StageLookup>({ status: 'loading' }),
          map((result) => ({ request, result }))
        )
      )
    )
  )
  readonly lookup = computed((): StageLookup => {
    const read = this.read()
    return read?.request === this.request() ? read.result : { status: 'loading' }
  })
  readonly stage = computed(() => {
    const original = this.lookup().stage
    return (
      original &&
      (this.facade
        .dashboard()
        .deployments.find(
          (s) =>
            s.deploymentId === original.deploymentId &&
            s.releasePackageId === original.releasePackageId &&
            sameEvolutionScope(s.scope, original.scope)
        ) ??
        original)
    )
  })
  readonly release = computed(() => {
    const s = this.stage()
    return (
      s &&
      this.facade
        .dashboard()
        .releases.find((r) => r.releasePackageId === s.releasePackageId && sameEvolutionScope(r.scope, s.scope))
    )
  })
  readonly record = computed(() => {
    const r = this.release()
    return (
      r &&
      this.facade
        .lifecycleRecords()
        .find(
          (c) =>
            c.id === r.candidateId &&
            c.releasePackageId === r.releasePackageId &&
            c.targetId === r.targetId &&
            sameEvolutionScope(c.scope, r.scope)
        )
    )
  })
  readonly mismatch = computed(() => {
    const q = this.query(),
      r = this.release()
    return (
      !!r &&
      ((!this.legacy() && q.has('changeId') && q.get('changeId') !== r.candidateId) ||
        (q.has('target') && q.get('target') !== 'all' && q.get('target') !== r.targetId))
    )
  })
  readonly renderable = computed(() => {
    const stage = this.stage()
    return (
      stage &&
      ['shadow', 'canary', 'production'].includes(stage.channel) &&
      Number.isFinite(Date.parse(stage.startedAt)) &&
      (!stage.completedAt || Number.isFinite(Date.parse(stage.completedAt))) &&
      Number.isFinite(stage.sampleCount) &&
      Number.isFinite(stage.severeErrors) &&
      Number.isFinite(stage.candidateAccuracy) &&
      (stage.dataSource === 'runtime_telemetry' ||
        (stage.dataSource === 'deterministic_replay' && Array.isArray(stage.observations)))
    )
  })
  readonly linked = computed(
    () =>
      !!this.renderable() &&
      !!this.record() &&
      !this.mismatch() &&
      !!this.release() &&
      this.facade.visibleTargets().some((t) => t.targetId === this.release()?.targetId)
  )
  readonly historyQuery = computed(() =>
    this.linked() ? { target: this.release()!.targetId, changeId: this.record()!.id } : { view: 'directory' }
  )
  readonly targetName = computed(() => {
    this.lang()
    const target = this.facade.visibleTargets().find((t) => t.targetId === this.release()?.targetId)
    return target ? targetLabel(target, this.i18n.currentLang) : this.release()?.targetId
  })
  readonly title = computed(() => {
    const record = this.record(),
      release = this.release(),
      dashboard = this.facade.dashboard()
    const candidate = dashboard.candidates.find((c) => c.candidateId === release?.candidateId)
    return (
      (candidate &&
        dashboard.proposals.find(
          (p) => p.proposalId === candidate.proposalId && p.revision === candidate.proposalRevision
        )?.title) ||
      record?.presentation?.title ||
      record?.title
    )
  })
  readonly stageName = computed(() => {
    this.lang()
    const s = this.stage()
    return !s
      ? ''
      : s.channel === 'canary'
        ? this.i18n.instant(this.w + 'Canary', { n: s.canaryPercent })
        : this.i18n.instant(this.w + (s.channel === 'production' ? 'Production' : 'Shadow'))
  })
  readonly pointer = computed(() => {
    const r = this.release()
    return r && productionPointer(r, this.facade.dashboard().pointers)
  })
  readonly live = computed(() => {
    const pointer = this.pointer(),
      dashboard = this.facade.dashboard()
    if (!pointer?.releasePackageId) return null
    const release = dashboard.releases.find(
      (r) =>
        r.status === 'active' &&
        r.releasePackageId === pointer.releasePackageId &&
        r.targetId === pointer.targetId &&
        r.targetVersionId === pointer.activeVersionId &&
        sameEvolutionScope(r.scope, pointer.scope)
    )
    if (!release) return null
    const stage = dashboard.deployments
      .filter(
        (s) =>
          s.releasePackageId === release.releasePackageId &&
          s.channel === 'production' &&
          s.status === 'active' &&
          !s.completedAt &&
          sameEvolutionScope(s.scope, pointer.scope)
      )
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0]
    return stage
      ? {
          stage,
          query: {
            target: release.targetId,
            changeId: release.candidateId,
            view: 'observations',
            stage: stage.deploymentId
          }
        }
      : null
  })
  readonly correct = reviewedCorrect
  version(id?: string) {
    if (!id) return '—'
    const version = this.facade
      .dashboard()
      .versions.find((v) => v.versionId === id && v.targetId === this.release()?.targetId)
    return version?.semanticVersion ? 'v' + version.semanticVersion : id
  }
  readonly zone = computed(() => {
    this.lang()
    return new Intl.DateTimeFormat(this.i18n.currentLang, { timeZoneName: 'longGeneric' })
      .formatToParts(new Date())
      .find((p) => p.type === 'timeZoneName')?.value
  })
  readonly filter = signal<HitFilter>('all')
  readonly filters: HitFilter[] = ['all', 'natural', 'specified']
  readonly page = signal(1)
  readonly size = 8
  private readonly evidenceKey = computed(() => {
    const stage = this.stage(),
      r = this.release()
    if (!this.linked() || !stage || !r || stage.dataSource !== 'runtime_telemetry') return ''
    return JSON.stringify([
      this.activeScope(),
      r.releasePackageId,
      stage.deploymentId,
      stage.sampleCount,
      stage.completedAt,
      this.retryTick()
    ])
  })
  private readonly response = signal<{ key: string; value: ReturnType<typeof stageEvidence> | null } | null>(null)
  readonly evidence = computed(() => (this.response()?.key === this.evidenceKey() ? this.response()?.value : undefined))
  readonly filtered = computed(() => {
    const rows = this.evidence()?.rows ?? []
    return this.filter() === 'all' ? rows : rows.filter((r) => r.source === this.filter())
  })
  readonly pages = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.size)))
  readonly currentPage = computed(() => Math.min(this.page(), this.pages()))
  readonly visible = computed(() =>
    this.filtered().slice((this.currentPage() - 1) * this.size, this.currentPage() * this.size)
  )
  count(filter: HitFilter) {
    const ev = this.evidence()
    return !ev
      ? '—'
      : filter === 'all'
        ? ev.rows.length
        : ev.attributable
          ? ev.rows.filter((r) => r.source === filter).length
          : '—'
  }
  select(filter: HitFilter) {
    this.filter.set(filter)
    this.page.set(1)
  }
  retry() {
    this.retryTick.update((n) => n + 1)
    if (this.facade.error()) void this.facade.load()
  }
  private readonly dialogs = inject(Dialog)
  private readonly container = inject(ViewContainerRef)
  private dialog?: DialogRef
  readonly rawTemplate = viewChild.required<TemplateRef<unknown>>('rawTemplate')
  showRaw() {
    if (!this.stage() || this.mismatch() || this.dialog) return
    this.dialog = this.dialogs.open(this.rawTemplate(), {
      viewContainerRef: this.container,
      width: '760px',
      maxWidth: 'calc(100vw - 2rem)',
      maxHeight: '73dvh',
      autoFocus: 'first-heading',
      ariaLabel: this.i18n.instant(this.p + 'RawTitle'),
      backdropClass: 'backdrop-blur-xs-black',
      panelClass: 'xp-overlay-pane-dialog'
    })
    this.dialog.closed.subscribe(() => (this.dialog = undefined))
  }
  closeRaw() {
    this.dialog?.close()
  }
  constructor() {
    effect((cleanup) => {
      this.activeScope()
      this.id()
      untracked(() => this.select('all'))
      cleanup(() => this.closeRaw())
    })
    effect(() => {
      const r = this.release(),
        s = this.stage()
      if (this.legacy() && this.linked() && r && s)
        void this.router.navigate(['/agent-evolution/release'], {
          replaceUrl: true,
          queryParams: { target: r.targetId, changeId: r.candidateId, view: 'observations', stage: s.deploymentId }
        })
    })
    effect((cleanup) => {
      const key = this.evidenceKey()
      if (!key) return
      let alive = true
      cleanup(() => {
        alive = false
      })
      untracked(async () => {
        const r = this.release()!,
          s = this.stage()!
        try {
          const [rows, overrides] = await Promise.all([
            loadAllEvolutionPages((page) =>
              firstValueFrom(
                this.api.listReleaseObservations({
                  targetId: r.targetId,
                  releasePackageId: r.releasePackageId,
                  page,
                  pageSize: 100
                })
              )
            ),
            this.readAssignments(r, s)
          ])
          if (alive) this.response.set({ key, value: stageEvidence(s, r, rows, overrides) })
        } catch {
          if (alive) this.response.set({ key, value: null })
        }
      })
    })
  }
  private readAssignments(r: ReleasePackage, s: ReleaseDeployment) {
    if (s.channel !== 'canary') return Promise.resolve(null)
    return firstValueFrom(this.api.listCanaryTestOverrides(r.releasePackageId)).catch(() => null)
  }
}
