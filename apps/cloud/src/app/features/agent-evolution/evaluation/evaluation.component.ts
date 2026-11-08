import { CommonModule } from '@angular/common'
import { Component, computed, DestroyRef, effect, inject, signal, untracked, ViewContainerRef } from '@angular/core'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { ActivatedRoute, Router, RouterLink } from '@angular/router'
import { map } from 'rxjs'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { Store, AIPermissionsEnum } from '@cloud/app/@core'
import { injectActiveScope } from '@cloud/app/@core/state'
import type { EvaluationRun, EvolutionCandidate, ImprovementProposal } from '@xpert-ai/contracts'
import {
  ZardButtonComponent,
  ZardComboboxComponent,
  ZardDialogService,
  ZardDialogRef,
  ZardSearchInputComponent
} from '@xpert-ai/headless-ui'
import { AgentEvolutionFacade } from '../agent-evolution.facade'
import { sameEvolutionScope } from '../agent-evolution.types'
import { EvolutionChangePanelComponent } from '../changes/change-panel.component'
import { LearningCandidateFormComponent } from '../learning/learning-candidate-form.component'
import { targetLabel } from '../targets/target-directory'
import { ReplayResultComponent } from './replay-result.component'
import { compactId } from './replay-presentation'
import { ConfirmReplayComponent, type ReplayConfirmation } from './confirm-replay.component'
import { EvolutionPageHeaderComponent } from '../shared/evolution-page-header.component'
import { DatasetEditorComponent } from './dataset-editor.component'

@Component({
  selector: 'xp-agent-evolution-evaluation',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    TranslateModule,
    ZardButtonComponent,
    ZardComboboxComponent,
    ZardSearchInputComponent,
    EvolutionChangePanelComponent,
    LearningCandidateFormComponent,
    ReplayResultComponent,
    DatasetEditorComponent,
    EvolutionPageHeaderComponent
  ],
  templateUrl: './evaluation.component.html',
  host: { class: 'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden' }
})
export class AgentEvolutionEvaluationComponent {
  readonly facade = inject(AgentEvolutionFacade)
  private readonly router = inject(Router)
  private readonly route = inject(ActivatedRoute)
  private readonly translate = inject(TranslateService)
  private readonly scope = injectActiveScope()
  private readonly store = inject(Store)
  private readonly dialog = inject(ZardDialogService)
  private readonly container = inject(ViewContainerRef)
  private readonly destroy = inject(DestroyRef)
  private confirmRef?: ZardDialogRef<ConfirmReplayComponent, boolean>
  readonly canManage = toSignal(
    this.store.userRolePermissions$.pipe(map(() => this.store.hasPermission(AIPermissionsEnum.EVOLUTION_MANAGE))),
    { initialValue: this.store.hasPermission(AIPermissionsEnum.EVOLUTION_MANAGE) }
  )
  readonly lang = toSignal(this.translate.onLangChange)
  readonly q = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap })
  readonly prefix = 'XP.AgentEvolution.ReplayWorkbench.'
  readonly short = compactId
  readonly term = signal('')
  readonly status = signal('all')
  readonly records = this.facade.contextLifecycleRecords
  readonly proposals = this.facade.contextProposals
  readonly built = this.facade.contextCandidates
  readonly runs = computed(() =>
    this.facade
      .contextEvaluations()
      .slice()
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  )
  readonly byTarget = computed(() => new Map(this.facade.visibleTargets().map((t) => [t.targetId, t])))
  readonly pending = computed(() =>
    this.proposals().filter(
      (p) =>
        p.status === 'ready' &&
        this.byTarget().get(p.targetId)?.candidateForm &&
        this.byTarget().get(p.targetId)?.capabilities.candidateBuild &&
        !this.findBuilt(p)
    )
  )
  readonly tab = computed(() =>
    this.run() || this.runningHere() || this.q().get('view') === 'runs' ? 'runs' : 'candidates'
  )
  readonly targetOptions = computed(() => {
    this.lang()
    return [
      { value: 'all', label: this.t('XP.AgentEvolution.Overview.AllTargets') },
      ...this.facade.visibleTargets().map((t) => ({ value: t.targetId, label: this.name(t.targetId) }))
    ]
  })
  readonly filterOptions = computed(() => {
    this.lang()
    return ['all', 'waiting', 'passed', 'blocked', 'running', 'checks'].map((value) => ({
      value,
      label: this.t(this.prefix + 'status_' + value)
    }))
  })
  readonly run = computed(() =>
    this.runs().find(
      (r) =>
        r.runId === this.q().get('runId') && (!this.q().get('changeId') || r.candidateId === this.q().get('changeId'))
    )
  )
  readonly id = computed(() => this.q().get('changeId') || this.run()?.candidateId)
  readonly candidate = computed(() => this.built().find((c) => c.candidateId === this.id()))
  readonly record = computed(() => this.records().find((c) => c.id === this.id()))
  readonly resource = computed(() => this.facade.contextChanges().find((c) => c.changeId === this.id()))
  readonly proposal = computed(() => {
    const id = this.q().get('proposalId')
    return this.proposals().find((p) =>
      id
        ? p.proposalId === id && p.revision === Number(this.q().get('revision'))
        : this.candidate()
          ? this.candidate()!.proposalId === p.proposalId && this.candidate()!.proposalRevision === p.revision
          : this.id() && 'candidateId' in p && p.candidateId === this.id()
    )
  })
  readonly latest = computed(() => this.runs().find((r) => r.candidateId === this.id()))
  readonly snapshots = computed(() => {
    const c = this.candidate()
    return c
      ? this.facade
          .contextDatasets()
          .filter((d) => d.targetId === c.targetId && sameEvolutionScope(d.scope, c.targetScope))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      : []
  })
  readonly chosen = computed(() => this.snapshots().find((d) => d.snapshotId === this.q().get('snapshot')))
  readonly runSnapshot = computed(() =>
    this.facade.contextDatasets().find((d) => d.snapshotId === this.run()?.datasetSnapshotId)
  )
  readonly canRun = computed(
    () =>
      this.canManage() &&
      !!this.chosen() &&
      !!this.candidate() &&
      ['ready', 'evaluating'].includes(this.candidate()!.status) &&
      this.record()?.capabilities.evaluate &&
      !this.facade.mutating()
  )
  readonly running = computed(() => {
    const active = new Map<string, string>()
    for (const change of this.facade.contextChanges()) {
      if (change.evaluation || !change.stages.some((s) => s.key === 'evaluation' && s.status === 'running')) continue
      const step = change.strategy.definition.evaluations.find((s) => s.kind === 'golden_replay')
      const snapshot = step && change.datasetSnapshotIds[step.key]
      if (snapshot && this.built().some((c) => c.candidateId === change.changeId)) active.set(change.changeId, snapshot)
    }
    const local = this.facade.pendingReplay()
    if (local && this.built().some((c) => c.candidateId === local.candidateId))
      active.set(local.candidateId, local.snapshotId)
    return active
  })
  readonly runningHere = computed(() => this.running().get(this.id() || ''))
  readonly runningSnapshot = computed(() => this.snapshots().find((d) => d.snapshotId === this.runningHere()))
  readonly stage = computed(() => {
    if (this.q().has('runId')) return this.run() ? 'result' : 'missing'
    if (this.q().has('proposalId')) return this.proposal() ? 'build' : 'missing'
    if (!this.id()) return 'directory'
    if (this.runningHere()) return 'running'
    if (this.q().get('view') === 'checks' && this.resource()) return 'checks'
    if (!this.candidate() && this.proposal() && this.pending().includes(this.proposal()!)) return 'build'
    if (this.candidate()?.strategy.definition.evaluations.some((step) => step.kind === 'golden_replay')) {
      if (this.latest()) return 'latest'
      return 'prepare'
    }
    return this.resource() ? 'checks' : 'missing'
  })
  readonly editingCandidate = computed(() =>
    this.stage() === 'prepare' && this.q().get('view') === 'dataset' && this.canManage() ? this.candidate() : null
  )
  editDataset() {
    if (this.stage() === 'prepare' && this.canManage())
      void this.go({ changeId: this.id()!, snapshot: this.chosen()?.snapshotId ?? null, view: 'dataset' })
  }
  leaveDataset(snapshot = this.chosen()?.snapshotId) {
    void this.go({ changeId: this.id()!, snapshot: snapshot ?? null }, true)
  }
  readonly rows = computed(() =>
    this.built()
      .map((c) => {
        const p = this.proposals().find((v) => v.proposalId === c.proposalId && v.revision === c.proposalRevision)
        const rec = this.records().find((r) => r.id === c.candidateId)
        const r = this.runs().find((v) => v.candidateId === c.candidateId)
        const replay = c.strategy.definition.evaluations.some((s) => s.kind === 'golden_replay')
        const state = r
          ? r.status === 'running'
            ? 'running'
            : r.gate.passed
              ? 'passed'
              : 'blocked'
          : !replay
            ? 'checks'
            : this.running().has(c.candidateId)
              ? 'running'
              : 'waiting'
        return { c, p, rec, r, state, title: p?.title || rec?.presentation?.title || rec?.title || c.targetId }
      })
      .sort((a, b) => b.c.createdAt.localeCompare(a.c.createdAt))
  )
  readonly visible = computed(() => {
    const term = this.term().trim().toLowerCase()
    return this.rows().filter(
      (row) =>
        (this.status() === 'all' || this.status() === row.state) &&
        [row.title, row.c.candidateId, row.c.proposalId, this.name(row.c.targetId)]
          .join(' ')
          .toLowerCase()
          .includes(term)
    )
  })
  readonly other = computed(() =>
    this.records().filter(
      (rec) =>
        !this.built().some((c) => c.candidateId === rec.id) &&
        !this.pending().some((p) => 'candidateId' in p && p.candidateId === rec.id)
    )
  )
  constructor() {
    effect(() => {
      const q = this.q()
      const target = q.get('target')
      const deep = q.has('changeId') || q.has('runId') || q.has('proposalId')
      untracked(() => {
        if ((target || deep) && this.facade.selectedTargetId() !== (target || 'all'))
          this.facade.selectTarget(target || 'all')
        this.confirmRef?.close(false)
      })
    })
    effect(() => {
      this.scope()
      untracked(() => {
        this.confirmRef?.close(false)
        this.term.set('')
        this.status.set('all')
      })
    })
    effect(() => {
      if (this.stage() === 'latest' && this.latest()) untracked(() => this.showRun(this.latest()!, true))
    })
    effect(() => {
      const change = this.resource()
      if (
        this.stage() === 'checks' &&
        change?.candidate?.artifact?.hash &&
        change.evaluation &&
        ['pending_approval', 'approved', 'publishing', 'published', 'rejected', 'test_failed', 'stale'].includes(
          change.status
        )
      ) {
        untracked(
          () =>
            void this.router.navigate(['/agent-evolution/evaluation/approval', change.changeId], {
              queryParams: { target: this.q().get('target') },
              replaceUrl: true
            })
        )
      }
    })
    // A second tab can finish a run while this page is open. Refresh its persisted metrics once per new assessment.
    let hydrated = ''
    effect(() => {
      const assessment = this.record()?.evaluation
      const step = this.candidate()?.strategy.definition.evaluations.some((s) => s.kind === 'golden_replay')
      if (!step || !assessment || this.facade.pendingReplay() || this.facade.loading()) return
      const evidence = assessment.checks.flatMap((check) => check.evidenceRefs)
      if (
        evidence.length &&
        !this.runs().some((run) => run.candidateId === this.id() && evidence.includes(run.runId)) &&
        hydrated !== assessment.runId
      ) {
        hydrated = assessment.runId
        untracked(() => void this.facade.load({ silent: true }))
      }
    })
    this.destroy.onDestroy(() => this.confirmRef?.close(false))
  }
  t(key: string) {
    return this.translate.instant(key)
  }
  name(id: string) {
    this.lang()
    const t = this.byTarget().get(id)
    return t ? targetLabel(t, this.translate.currentLang) : id
  }
  title(id: string) {
    return (
      this.rows().find((r) => r.c.candidateId === id)?.title || this.records().find((r) => r.id === id)?.title || id
    )
  }
  findBuilt(p: ImprovementProposal) {
    return this.built().find((c) => c.proposalId === p.proposalId && c.proposalRevision === p.revision)
  }
  go(params: Record<string, string | number | null> = {}, replaceUrl = false) {
    return this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        target: this.facade.selectedTargetId() === 'all' ? null : this.facade.selectedTargetId(),
        ...params
      },
      replaceUrl
    })
  }
  selectTarget(id: string | null) {
    this.facade.selectTarget(id || 'all')
    this.term.set('')
    this.status.set('all')
    void this.go(this.tab() === 'runs' ? { view: 'runs' } : {})
  }
  directory(tab: string) {
    void this.go(tab === 'runs' ? { view: 'runs' } : {})
  }
  showProposal(p: ImprovementProposal) {
    void this.go({ proposalId: p.proposalId, revision: p.revision })
  }
  showCandidate(c: EvolutionCandidate) {
    void this.go({ changeId: c.candidateId })
  }
  showRun(r: EvaluationRun, replace = false) {
    void this.go({ changeId: r.candidateId, runId: r.runId }, replace)
  }
  setCase(selection: { id: string; index: number | null } | null) {
    const r = this.run()
    if (r)
      void this.go({
        changeId: r.candidateId,
        runId: r.runId,
        caseId: selection?.id ?? null,
        caseIndex: selection?.index ?? null
      })
  }
  choose(snapshot: string) {
    void this.go({ changeId: this.id()!, snapshot }, true)
  }
  confirm() {
    const c = this.candidate(),
      d = this.chosen()
    if (!this.canRun() || !c || !d || this.confirmRef) return
    const scope = this.scope()
    const ref = this.dialog.create<ConfirmReplayComponent, ReplayConfirmation>({
      zContent: ConfirmReplayComponent,
      zTitle: this.t(this.prefix + 'ConfirmTitle'),
      zDescription: this.t(this.prefix + 'ConfirmDescription'),
      zWidth: 'min(490px, calc(100vw - 24px))',
      zHideFooter: true,
      zMaskClosable: false,
      zViewContainerRef: this.container,
      zData: { title: this.title(c.candidateId), target: this.name(c.targetId), candidate: c, dataset: d }
    })
    this.confirmRef = ref
    ref.closed.pipe(takeUntilDestroyed(this.destroy)).subscribe(async (ok) => {
      this.confirmRef = undefined
      if (
        !ok ||
        this.scope() !== scope ||
        !this.canRun() ||
        this.chosen()?.snapshotId !== d.snapshotId ||
        this.id() !== c.candidateId
      )
        return
      const run = await this.facade.evaluateCandidate(c, d)
      if (
        run &&
        !this.destroy.destroyed &&
        this.scope() === scope &&
        this.id() === c.candidateId &&
        !this.q().has('runId')
      )
        this.showRun(run, true)
    })
  }
}
