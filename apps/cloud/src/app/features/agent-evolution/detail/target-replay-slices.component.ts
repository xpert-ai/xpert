import { Component, computed, effect, inject, input, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { RouterLink } from '@angular/router'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { resolveI18nText, type EvaluationRun, type EvolutionTargetDescriptor } from '@xpert-ai/contracts'
import { ZardButtonComponent } from '@xpert-ai/headless-ui'
import { injectActiveScope } from '@cloud/app/@core/state'
import { AgentEvolutionApiService } from '../agent-evolution-api.service'

@Component({
  selector: 'xp-target-replay-slices',
  imports: [TranslateModule, RouterLink, ZardButtonComponent],
  templateUrl: './target-replay-slices.component.html'
})
export class TargetReplaySlicesComponent {
  readonly target = input.required<EvolutionTargetDescriptor>()
  readonly p = 'XP.AgentEvolution.TargetDetail.'
  readonly run = signal<EvaluationRun | null>(null)
  readonly status = signal<'loading' | 'ready' | 'error'>('loading')
  readonly attempt = signal(0)
  private readonly scope = injectActiveScope()
  private readonly api = inject(AgentEvolutionApiService)
  private readonly i18n = inject(TranslateService)
  private readonly lang = toSignal(this.i18n.onLangChange)
  readonly rows = computed(() => {
    this.lang()
    const language = this.i18n.currentLang || 'en-US'
    const percent = new Intl.NumberFormat(language, { style: 'percent', maximumFractionDigits: 1 })
    return this.target().replaySlices?.map(({ key, label }) => {
      const metrics = this.run()?.sliceMetrics?.find((item) => item.slice === key)
      return {
        key,
        label: resolveI18nText(label, language) || key,
        samples: metrics?.totalCases,
        baseline: metrics?.baselineAccuracy != null ? percent.format(metrics.baselineAccuracy) : '—',
        candidate: metrics?.candidateAccuracy != null ? percent.format(metrics.candidateAccuracy) : '—'
      }
    })
  })

  constructor() {
    effect((cleanup) => {
      this.scope()
      this.attempt()
      const targetId = this.target().targetId
      this.run.set(null)
      this.status.set('loading')
      const sub = this.api.listEvaluations({ targetId, pageSize: 1, sort: 'createdAt', order: 'DESC' }).subscribe({
        next: ({ items }) => {
          const latest = items[0]
          this.run.set(latest?.targetId === targetId ? latest : null)
          this.status.set('ready')
        },
        error: () => this.status.set('error')
      })
      cleanup(() => sub.unsubscribe())
    })
  }
}
