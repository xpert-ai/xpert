import { JsonPipe } from '@angular/common'
import { HttpErrorResponse } from '@angular/common/http'
import { Component, computed, effect, inject, signal } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { ActivatedRoute, Router, RouterLink } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import type { DatasetSnapshot, EvaluationRun, EvolutionTargetDescriptor } from '@xpert-ai/contracts'
import { ZardButtonComponent } from '@xpert-ai/headless-ui'
import { catchError, forkJoin, map, of, startWith, switchMap } from 'rxjs'
import { injectActiveScope } from '@cloud/app/@core/state'
import { AgentEvolutionApiService } from '../agent-evolution-api.service'
import { AgentEvolutionFacade } from '../agent-evolution.facade'
import { findEvolutionTarget, findHistoricalRun, findReplaySnapshot } from '../evolution-resource-lookup'
import { ReplayResultComponent } from './replay-result.component'
import { supportsHistoricalResult } from './replay-history'

type Lookup = {
  status: 'loading' | 'found' | 'missing' | 'sliceMissing' | 'denied' | 'failed'
  run?: EvaluationRun
  target?: EvolutionTargetDescriptor
  snapshot?: DatasetSnapshot
}

@Component({
  imports: [JsonPipe, RouterLink, TranslateModule, ZardButtonComponent, ReplayResultComponent],
  templateUrl: './historical-run.component.html',
  host: { class: 'flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto' }
})
export class HistoricalRunComponent {
  readonly p = 'XP.AgentEvolution.ReplayHistory.'
  readonly facade = inject(AgentEvolutionFacade)
  private readonly router = inject(Router)
  private readonly route = inject(ActivatedRoute)
  private readonly api = inject(AgentEvolutionApiService)
  private readonly scope = injectActiveScope()
  private readonly params = toSignal(this.route.paramMap, { initialValue: this.route.snapshot.paramMap })
  readonly query = toSignal(this.route.queryParamMap, { initialValue: this.route.snapshot.queryParamMap })
  readonly id = computed(() => this.params().get('resourceId') ?? '')
  readonly slice = computed(() => this.query().get('slice'))
  readonly attempt = signal(0)
  private readonly request = computed(() => ({
    id: this.id(),
    scope: this.scope(),
    slice: this.slice(),
    attempt: this.attempt()
  }))
  readonly state = toSignal(
    toObservable(this.request).pipe(
      switchMap((request) =>
        findHistoricalRun(this.api, request.id).pipe(
          switchMap((run) => {
            if (!run) return of<Lookup>({ status: 'missing' })
            if (request.slice === null) return of<Lookup>({ status: 'found', run })
            if (!run.targetId || !run.sliceMetrics?.some((group) => group.slice === request.slice))
              return of<Lookup>({ status: 'sliceMissing' })
            return forkJoin({
              target: findEvolutionTarget(this.api, run.targetId),
              snapshot: findReplaySnapshot(this.api, run)
            }).pipe(
              map(
                ({ target, snapshot }): Lookup => ({
                  status: 'found',
                  run,
                  target: target ?? undefined,
                  snapshot: snapshot ?? undefined
                })
              )
            )
          }),
          catchError((err: unknown) =>
            of<Lookup>({
              status: err instanceof HttpErrorResponse && [401, 403].includes(err.status) ? 'denied' : 'failed'
            })
          ),
          startWith<Lookup>({ status: 'loading' }),
          map((value) => ({ request, value }))
        )
      )
    )
  )
  readonly lookup = computed<Lookup>(() => {
    const state = this.state()
    return state?.request === this.request() ? state.value : { status: 'loading' as const, run: undefined }
  })
  readonly overview = computed(() => this.query().get('from') === 'overview')
  readonly returnQuery = computed(() =>
    this.overview()
      ? { history: 'open', target: this.query().get('historyTarget') || 'all', focusRun: this.id() }
      : { view: 'runs', target: this.lookup().run?.targetId }
  )
  constructor() {
    effect(() => {
      const run = this.lookup().run
      if (this.slice() !== null || !run || !this.facade.loadedAt() || this.facade.loading()) return
      const candidate = this.facade.dashboard().candidates.find((c) => c.candidateId === run.candidateId)
      if (
        !candidate ||
        !supportsHistoricalResult(run, candidate) ||
        !this.facade
          .dashboard()
          .evaluations.some((r) => r.runId === run.runId && r.candidateId === candidate.candidateId) ||
        !this.facade.visibleTargets().some((t) => t.targetId === candidate.targetId)
      )
        return
      const query = this.query()
      void this.router.navigate(['/agent-evolution/evaluation'], {
        replaceUrl: true,
        queryParams: {
          target: candidate.targetId,
          changeId: candidate.candidateId,
          runId: run.runId,
          from: this.overview() ? 'overview' : 'history',
          historyTarget: this.overview() ? query.get('historyTarget') || 'all' : null,
          caseId: query.get('caseId'),
          caseIndex: query.get('caseIndex')
        }
      })
    })
  }
  setCase(selection: { id: string; index: number | null } | null) {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParamsHandling: 'merge',
      queryParams: { caseId: selection?.id ?? null, caseIndex: selection?.index ?? null }
    })
  }
  retry() {
    this.attempt.update((n) => n + 1)
    if (this.facade.error()) void this.facade.load()
  }
}
