import { JsonPipe } from '@angular/common'
import { HttpErrorResponse } from '@angular/common/http'
import { Component, computed, effect, inject, signal } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { ActivatedRoute, Router, RouterLink } from '@angular/router'
import { TranslateModule } from '@ngx-translate/core'
import type { EvaluationRun } from '@xpert-ai/contracts'
import { ZardButtonComponent } from '@xpert-ai/headless-ui'
import { catchError, map, of, startWith, switchMap } from 'rxjs'
import { injectActiveScope } from '@cloud/app/@core/state'
import { AgentEvolutionApiService } from '../agent-evolution-api.service'
import { AgentEvolutionFacade } from '../agent-evolution.facade'
import { findHistoricalRun } from '../evolution-resource-lookup'
import { supportsHistoricalResult } from './replay-history'

type Lookup = { status: 'loading' | 'found' | 'missing' | 'denied' | 'failed'; run?: EvaluationRun }

@Component({
  imports: [JsonPipe, RouterLink, TranslateModule, ZardButtonComponent],
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
  readonly attempt = signal(0)
  private readonly request = computed(() => ({ id: this.id(), scope: this.scope(), attempt: this.attempt() }))
  readonly state = toSignal(
    toObservable(this.request).pipe(
      switchMap((request) =>
        findHistoricalRun(this.api, request.id).pipe(
          map((run): Lookup => (run ? { status: 'found', run } : { status: 'missing' })),
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
  readonly lookup = computed(() => {
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
      if (!run || !this.facade.loadedAt() || this.facade.loading()) return
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
  retry() {
    this.attempt.update((n) => n + 1)
    if (this.facade.error()) void this.facade.load()
  }
}
