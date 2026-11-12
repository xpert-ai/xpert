import { CommonModule } from '@angular/common'
import { Component, computed, inject, input, output, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import type { DatasetSnapshot, EvaluationRun, EvolutionTargetDescriptor, ReplayCaseResult } from '@xpert-ai/contracts'
import { Clipboard } from '@angular/cdk/clipboard'
import { ZardButtonComponent } from '@xpert-ai/headless-ui'
import {
  bundleVersion,
  caseOutcome,
  compactId,
  displayOutput,
  filterCases,
  type CaseFilter
} from './replay-presentation'

@Component({
  selector: 'xp-replay-result',
  standalone: true,
  imports: [CommonModule, TranslateModule, ZardButtonComponent],
  templateUrl: './replay-result.component.html'
})
export class ReplayResultComponent {
  readonly run = input.required<EvaluationRun>()
  readonly snapshot = input<DatasetSnapshot>()
  readonly target = input<EvolutionTargetDescriptor>()
  readonly title = input.required<string>()
  readonly caseId = input<string | null>(null)
  readonly caseIndex = input<string | null>(null)
  readonly caseChanged = output<{ id: string; index: number | null } | null>()
  readonly switchRun = output<void>()
  readonly historyBack = input<'overview' | 'history' | null>(null)
  readonly back = output<void>()
  readonly inspectSnapshot = output<void>()
  readonly prefix = 'XP.AgentEvolution.ReplayWorkbench.'
  private readonly translate = inject(TranslateService)
  private readonly language = toSignal(this.translate.onLangChange)
  private readonly clipboard = inject(Clipboard)
  readonly short = compactId
  readonly version = bundleVersion
  readonly outcome = caseOutcome
  readonly filter = signal<CaseFilter>('all')
  readonly page = signal(1)
  readonly copyStatus = signal('')
  readonly selected = computed(() => {
    const rows = this.run().caseResults
    if (this.caseIndex() !== null) {
      const item = rows[Number(this.caseIndex())]
      return item?.caseId === this.caseId() ? item : undefined
    }
    const matches = rows.filter((row) => row.caseId === this.caseId())
    return matches.length === 1 ? matches[0] : undefined
  })
  readonly frozen = computed(() => {
    const item = this.selected()
    if (!item) return
    const cases = this.snapshot()?.cases ?? []
    // The replay executor emits rows in frozen snapshot order, including repeated case IDs at different revisions.
    const corresponding = cases[this.run().caseResults.indexOf(item)]
    if (corresponding?.caseId === item.caseId) return corresponding
    const matches = cases.filter((c) => c.caseId === item.caseId)
    return matches.length === 1 ? matches[0] : undefined
  })
  readonly filters = computed<CaseFilter[]>(() => [
    'all',
    'improved',
    'regressed',
    'failed',
    ...(this.run().metrics.severeErrors ? ['severe' as const] : [])
  ])
  readonly rows = computed(() => filterCases(this.run(), this.filter()))
  readonly pages = computed(() => Math.max(1, Math.ceil(this.rows().length / 5)))
  readonly visible = computed(() => this.rows().slice((this.page() - 1) * 5, this.page() * 5))
  readonly baselinePassed = computed(() => this.run().caseResults.filter((row) => row.baselinePassed).length)
  readonly pct = (ratio: number) =>
    new Intl.NumberFormat(this.language()?.lang || this.translate.currentLang, {
      style: 'percent',
      maximumFractionDigits: 1
    }).format(ratio)
  readonly delta = computed(() =>
    new Intl.NumberFormat(this.language()?.lang || this.translate.currentLang, {
      signDisplay: 'exceptZero',
      maximumFractionDigits: 1
    }).format(this.run().metrics.accuracyDelta * 100)
  )
  count(filter: CaseFilter) {
    return filterCases(this.run(), filter).length
  }
  setFilter(filter: CaseFilter) {
    this.filter.set(filter)
    this.page.set(1)
  }
  value(row: ReplayCaseResult['candidateOutput'], raw = false) {
    return displayOutput(row, this.target(), this.language()?.lang || this.translate.currentLang, raw)
  }
  openCase(row: ReplayCaseResult | null) {
    this.copyStatus.set('')
    this.caseChanged.emit(
      row
        ? {
            id: row.caseId,
            index:
              this.run().caseResults.filter((r) => r.caseId === row.caseId).length > 1
                ? this.run().caseResults.indexOf(row)
                : null
          }
        : null
    )
  }
  reason(code: string) {
    this.language()
    if (code === 'severe_errors_present')
      return this.translate.instant(this.prefix + 'SevereReason', { n: this.run().metrics.severeErrors })
    if (code.startsWith('provider_metric:'))
      return this.translate.instant(this.prefix + 'MetricLimit', { name: code.slice('provider_metric:'.length) })
    return this.translate.instant(this.prefix + 'GateReason.' + code, { Default: code })
  }
  copyTrace(trace: string) {
    this.copyStatus.set(this.clipboard.copy(trace) ? 'Copied' : 'CopyFailed')
  }
}
