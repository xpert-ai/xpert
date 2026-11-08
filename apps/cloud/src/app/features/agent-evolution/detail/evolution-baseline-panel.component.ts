import { Component, computed, effect, inject, input, signal } from '@angular/core'
import { RouterLink } from '@angular/router'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { ZardButtonComponent } from '@xpert-ai/headless-ui'
import { resolveI18nText, type EvolutionBaselineInspection, type EvolutionTargetDescriptor } from '@xpert-ai/contracts'
import { ScopeService } from '@cloud/app/@core'
import { AgentEvolutionApiService } from '../agent-evolution-api.service'
import { compareRules, describeRule, inspectionFailure } from './rule-comparison'

@Component({
  selector: 'xp-evolution-baseline-panel',
  imports: [TranslateModule, RouterLink, ZardButtonComponent],
  templateUrl: './evolution-baseline-panel.component.html'
})
export class EvolutionBaselinePanelComponent {
  readonly targetId = input.required<string>()
  readonly descriptor = input<EvolutionTargetDescriptor>()
  readonly releaseCandidate = input<string>()
  readonly data = signal<EvolutionBaselineInspection | null>(null)
  readonly loading = signal(true)
  readonly failure = signal<ReturnType<typeof inspectionFailure> | null>(null)
  readonly raw = signal(false)
  private readonly attempt = signal(0)
  readonly p = 'XP.AgentEvolution.TargetDetail.'
  readonly #api = inject(AgentEvolutionApiService)
  readonly #scope = inject(ScopeService)
  readonly #i18n = inject(TranslateService)
  readonly #lang = toSignal(this.#i18n.onLangChange)
  readonly status = computed(() => this.data()?.status ?? this.failure())
  readonly comparison = computed(() => (this.data() ? compareRules(this.data()!) : null))
  readonly rows = computed(() => {
    this.#lang()
    const fields = this.descriptor()?.candidateForm?.fields ?? []
    return (this.comparison()?.rows ?? []).map((row) => ({
      label: this.tx(
        'Fields.' + row.key,
        resolveI18nText(fields.find((f) => f.key === row.key)?.label, this.#i18n.currentLang) || row.key
      ),
      key: row.key,
      active: describeRule(row.active, row.key, this.tx),
      source: describeRule(row.source, row.key, this.tx)
    }))
  })
  readonly sourceLabel = computed(() => {
    this.#lang()
    const d = this.descriptor()
    return d
      ? this.tx('Sources.' + d.targetId, resolveI18nText(d.label, this.#i18n.currentLang) || d.displayName)
      : this.targetId()
  })
  readonly issues = computed(() => {
    this.#lang()
    return this.data()?.preview.issues.map((code) => this.tx('Issues.' + code, code)) ?? []
  })
  readonly tx = (key: string, fallback?: string, count?: number): string => {
    const k = this.p + key,
      text = this.#i18n.instant(k, { count, Default: fallback ?? k })
    return text === k ? (fallback ?? k) : text
  }
  retry() {
    this.attempt.update((x) => x + 1)
  }
  constructor() {
    effect((cleanup) => {
      this.#scope.activeScope()
      this.attempt()
      this.data.set(null)
      this.failure.set(null)
      this.loading.set(true)
      this.raw.set(false)
      const request = this.#api.getRuleBaseline(this.targetId()).subscribe({
        next: (data) => {
          this.data.set(data)
          this.loading.set(false)
        },
        error: (err: unknown) => {
          this.failure.set(inspectionFailure(err))
          this.loading.set(false)
        }
      })
      cleanup(() => request.unsubscribe())
    })
  }
}
