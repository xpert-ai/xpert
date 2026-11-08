import { CommonModule } from '@angular/common'
import { Component, computed, DestroyRef, effect, inject, signal, untracked, ViewContainerRef } from '@angular/core'
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop'
import { ActivatedRoute, ParamMap, Router, RouterLink } from '@angular/router'
import { injectActiveScope } from '@cloud/app/@core/state'
import {
  resolveI18nText,
  type EvolutionLearningQuery,
  type ImprovementProposal,
  type LearningEvent,
  type LearningProposalRow
} from '@xpert-ai/contracts'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import {
  ZardButtonComponent,
  ZardComboboxComponent,
  ZardDialogRef,
  ZardDialogService,
  ZardMenuImports,
  ZardSearchInputComponent
} from '@xpert-ai/headless-ui'
import { catchError, forkJoin, map, of, startWith, switchMap } from 'rxjs'
import { AgentEvolutionApiService } from '../agent-evolution-api.service'
import { AgentEvolutionFacade } from '../agent-evolution.facade'
import { evolutionSummaryPresentation } from '../agent-evolution.types'
import { targetLabel } from '../targets/target-directory'
import { EvolutionLandingDirective } from '../shared/evolution-landing.directive'
import { LearningCandidateFormComponent } from './learning-candidate-form.component'
import { LearningProposalDialog } from './learning-proposal-dialog.component'

type View = 'feedback' | 'proposals'
interface Filters {
  search: string
  status: string
  kind: string
  page: number
}
const emptyFilters: Filters = { search: '', status: 'all', kind: 'all', page: 1 }
function destination(params: ParamMap) {
  return {
    event: params.get('eventId'),
    proposal: params.get('proposalId'),
    target: params.get('target'),
    cited: params.get('citedBy'),
    citing: params.get('citingEvent'),
    revision: Number(params.get('revision')) || undefined,
    view: (params.get('proposalId') || params.get('citingEvent') || params.get('view') === 'proposals'
      ? 'proposals'
      : 'feedback') as View
  }
}

@Component({
  selector: 'xp-agent-evolution-learning',
  standalone: true,
  imports: [
    CommonModule,
    TranslateModule,
    RouterLink,
    EvolutionLandingDirective,
    LearningCandidateFormComponent,
    ZardButtonComponent,
    ZardComboboxComponent,
    ZardSearchInputComponent,
    ...ZardMenuImports
  ],
  templateUrl: './learning.component.html',
  host: { class: 'flex min-h-0 min-w-0 flex-1 overflow-hidden' }
})
export class AgentEvolutionLearningComponent {
  readonly facade = inject(AgentEvolutionFacade)
  private readonly api = inject(AgentEvolutionApiService)
  private readonly translate = inject(TranslateService)
  private readonly router = inject(Router)
  private readonly route = inject(ActivatedRoute)
  private readonly dialog = inject(ZardDialogService)
  private readonly container = inject(ViewContainerRef)
  private readonly destroy = inject(DestroyRef)
  private readonly activeScope = injectActiveScope()
  private readonly lang = toSignal(this.translate.onLangChange)
  readonly prefix = 'XP.AgentEvolution.Learning.'
  readonly dest = toSignal(this.route.queryParamMap.pipe(map(destination)), {
    initialValue: destination(this.route.snapshot.queryParamMap)
  })
  readonly filters = signal<Filters>(emptyFilters)
  readonly expanded = signal<string | null>(null)
  readonly details = signal(false)
  readonly feedbackStatuses = ['all', 'pending', 'golden', 'ignored']
  readonly proposalStatuses = ['all', 'ready', 'candidate_built', 'draft', 'rejected']
  readonly kinds = ['all', 'corrected', 'grouped']
  readonly notice = signal('')
  readonly revision = signal(0)
  private checkRef?: ZardDialogRef<LearningProposalDialog>
  readonly targets = computed(() => new Map(this.facade.visibleTargets().map((t) => [t.targetId, t])))
  readonly options = computed(() => {
    this.lang()
    return [
      { value: 'all', label: this.translate.instant('XP.AgentEvolution.Overview.AllTargets') },
      ...Array.from(this.targets().values(), (t) => ({
        value: t.targetId,
        label: targetLabel(t, this.translate.currentLang)
      }))
    ]
  })
  readonly view = computed(() => this.dest().view)
  readonly contextual = computed(
    () => !!(this.dest().event || this.dest().proposal || this.dest().citing || this.dest().cited)
  )
  private readonly request = computed(() => {
    const f = this.filters(),
      d = this.dest(),
      target = this.facade.selectedTargetId()
    const base: EvolutionLearningQuery = {
      targetId: target === 'all' ? undefined : target,
      includeFixtures: this.facade.showFixtures()
    }
    const filtered = {
      ...base,
      page: f.page,
      pageSize: 5,
      search: f.search.trim() || undefined,
      status: f.status === 'all' ? undefined : f.status
    }
    const events: EvolutionLearningQuery =
      d.view === 'feedback'
        ? {
            ...filtered,
            eventId: d.event ?? undefined,
            proposalId: d.cited ?? undefined,
            revision: d.revision,
            corrected: f.kind === 'corrected',
            grouped: f.kind === 'grouped'
          }
        : { ...base, pageSize: 1 }
    const proposals: EvolutionLearningQuery =
      d.view === 'proposals'
        ? { ...filtered, eventId: d.citing ?? undefined, proposalId: d.proposal ?? undefined, revision: d.revision }
        : { ...base, pageSize: 1 }
    return {
      events,
      proposals,
      scope: this.activeScope(),
      refreshed: this.facade.loadedAt(),
      revision: this.revision()
    }
  })
  readonly state = toSignal(
    toObservable(this.request).pipe(
      switchMap(({ events, proposals }) =>
        forkJoin({
          events: this.api.learningReview(events),
          proposals: this.api.learningProposals(proposals)
        }).pipe(
          map((data) => ({ data, error: false })),
          catchError(() => of({ data: null, error: true })),
          startWith({ data: null, error: false })
        )
      )
    ),
    { initialValue: { data: null, error: false } }
  )
  readonly result = computed(() =>
    this.view() === 'feedback' ? this.state().data?.events : this.state().data?.proposals
  )
  readonly maxPage = computed(() => Math.max(1, Math.ceil((this.result()?.total ?? 0) / 5)))
  constructor() {
    effect(() => {
      const d = this.dest()
      untracked(() => {
        if (
          (d.target || d.event || d.proposal || d.cited || d.citing) &&
          this.facade.selectedTargetId() !== (d.target || 'all')
        )
          this.facade.selectTarget(d.target || 'all')
        this.filters.set(emptyFilters)
        this.expanded.set(null)
        this.details.set(false)
      })
    })
    effect(() => {
      this.activeScope()
      untracked(() => {
        this.checkRef?.close()
        this.notice.set('')
        this.expanded.set(null)
        this.details.set(false)
        this.filters.set(emptyFilters)
      })
    })
    effect(() => {
      const result = this.result()
      if (result && this.filters().page > this.maxPage()) this.page(this.maxPage())
    })
    this.destroy.onDestroy(() => this.checkRef?.close())
  }
  name(id: string) {
    this.lang()
    const target = this.targets().get(id)
    return target ? targetLabel(target, this.translate.currentLang) : id
  }
  reason(event: LearningEvent) {
    this.lang()
    return (
      event.reasonCodes
        .map(
          (code) =>
            resolveI18nText(
              this.targets().get(event.targetId)?.feedbackVocabulary?.reasons?.[code],
              this.translate.currentLang
            ) || this.translate.instant('XP.AgentEvolution.ReasonCode.' + code, { Default: code })
        )
        .join(' · ') || '—'
    )
  }
  summary(value: string, targetId: string) {
    this.lang()
    const label = resolveI18nText(
      this.targets().get(targetId)?.feedbackVocabulary?.values?.[value],
      this.translate.currentLang
    )
    if (label) return label
    const summary = evolutionSummaryPresentation(value)
    return (
      summary.text ||
      summary.fields
        .map(
          (f) =>
            this.translate.instant(f.labelKey, { Default: f.key }) +
            ' · ' +
            (f.valueKey ? this.translate.instant(f.valueKey, { Default: f.value }) : f.value)
        )
        .join(' / ') ||
      '—'
    )
  }
  rootCause(p: ImprovementProposal) {
    const prefix = 'repeated_correction_signature:'
    if (!p.rootCause.startsWith(prefix)) return p.rootCause
    const names = p.rootCause
      .slice(prefix.length)
      .split(',')
      .map(
        (code) =>
          resolveI18nText(
            this.targets().get(p.targetId)?.feedbackVocabulary?.reasons?.[code.trim()],
            this.translate.currentLang
          ) || code.trim()
      )
    return this.translate.instant(this.prefix + 'Repeated') + ' · ' + names.join(', ')
  }
  selectTarget(id: string | null) {
    this.facade.selectTarget(id || 'all')
    this.filters.set(emptyFilters)
    this.expanded.set(null)
    this.details.set(false)
    this.navigate(this.view())
  }
  navigate(view: View, params: Record<string, string | number> = {}) {
    this.notice.set('')
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        ...(view === 'proposals' ? { view } : {}),
        target: this.facade.selectedTargetId() === 'all' ? null : this.facade.selectedTargetId(),
        ...params
      }
    })
  }
  setFilter(f: Partial<Filters>) {
    this.filters.update((old) => ({ ...old, ...f, page: 1 }))
    this.expanded.set(null)
    this.details.set(false)
  }
  page(n: number) {
    this.filters.update((old) => ({ ...old, page: n }))
    this.expanded.set(null)
    this.details.set(false)
  }
  key(row: LearningProposalRow) {
    return row.proposal.proposalId + '@' + row.proposal.revision
  }
  isExpanded(id: string, first: boolean) {
    return this.expanded() === null ? first : this.expanded() === id
  }
  toggle(id: string, first: boolean) {
    this.expanded.set(this.isExpanded(id, first) ? '' : id)
    this.details.set(false)
  }
  async review(event: LearningEvent, status: 'pending' | 'golden' | 'ignored') {
    if (this.facade.mutating()) return
    const scope = this.activeScope()
    if ((await this.facade.reviewEvent(event.eventId, status)) && scope === this.activeScope()) {
      this.notice.set(
        this.translate.instant(this.prefix + 'ReviewSaved', {
          status: this.translate.instant(this.prefix + 'Mark_' + status)
        })
      )
      this.revision.update((x) => x + 1)
    }
  }
  check(event: LearningEvent) {
    if (this.checkRef || event.reviewStatus === 'ignored') return
    const ref = this.dialog.create<
      LearningProposalDialog,
      { event: LearningEvent; targetName: string; reason: string; prediction: string; outcome: string }
    >({
      zContent: LearningProposalDialog,
      zTitle: this.translate.instant(this.prefix + 'Generate'),
      zDescription: this.translate.instant(this.prefix + 'CheckIntro'),
      zWidth: 'min(585px, calc(100vw - 24px))',
      zHideFooter: true,
      zViewContainerRef: this.container,
      zMaskClosable: false,
      zData: {
        event,
        targetName: this.name(event.targetId),
        reason: this.reason(event),
        prediction: this.summary(event.predictionSummary, event.targetId),
        outcome: this.summary(event.finalOutcomeSummary, event.targetId)
      }
    })
    this.checkRef = ref
    const scope = this.activeScope()
    ref.closed.pipe(takeUntilDestroyed(this.destroy)).subscribe((p: ImprovementProposal | undefined) => {
      this.checkRef = undefined
      if (!p || scope !== this.activeScope()) return
      this.navigate('proposals', { proposalId: p.proposalId, revision: p.revision })
      this.notice.set(this.translate.instant(this.prefix + 'Created'))
      this.revision.update((x) => x + 1)
      void this.facade.load({ silent: true })
    })
  }
}
