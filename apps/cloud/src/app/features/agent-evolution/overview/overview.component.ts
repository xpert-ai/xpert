import { CommonModule } from '@angular/common'
import { Component, ElementRef, OnDestroy, afterNextRender, computed, inject, signal, viewChild } from '@angular/core'
import { RouterLink } from '@angular/router'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ZardBadgeComponent, ZardButtonComponent, ZardComboboxComponent } from '@xpert-ai/headless-ui'
import { toSignal } from '@angular/core/rxjs-interop'
import { resolveI18nText, type EvolutionLifecycleRecord } from '@xpert-ai/contracts'
import { AgentEvolutionFacade } from '../agent-evolution.facade'
import { targetLabel } from '../targets/target-directory'
import { percent } from '../agent-evolution.types'
import { activeImprovement, overviewLabel, overviewRate, overviewTasks } from './overview-presentation'

@Component({
  standalone: true,
  selector: 'xp-agent-evolution-overview',
  imports: [CommonModule, RouterLink, TranslateModule, ZardBadgeComponent, ZardButtonComponent, ZardComboboxComponent],
  templateUrl: './overview.component.html',
  host: { class: 'flex min-h-0 flex-1 overflow-hidden' }
})
export class AgentEvolutionOverviewComponent implements OnDestroy {
  readonly facade = inject(AgentEvolutionFacade)
  private readonly translate = inject(TranslateService)
  private readonly languageChange = toSignal(this.translate.onLangChange)
  readonly targetOptions = computed(() => {
    this.languageChange()
    return [
      { value: 'all', label: this.translate.instant(overviewLabel('AllTargets')) },
      ...this.facade
        .visibleTargets()
        .map((t) => ({ value: t.targetId, label: targetLabel(t, this.translate.currentLang) }))
    ]
  })
  recordTitle(record: EvolutionLifecycleRecord) {
    this.languageChange()
    return (
      resolveI18nText(record.presentation?.business?.title, this.translate.currentLang) ||
      record.presentation?.title ||
      record.title
    )
  }
  readonly key = overviewLabel
  readonly percent = percent
  readonly historyOpen = signal(false)
  readonly scroll = viewChild.required<ElementRef<HTMLElement>>('scroll')
  readonly targetNames = computed(() => new Map(this.facade.contextTargets().map((t) => [t.targetId, t.displayName])))
  readonly productionPointers = computed(() => this.facade.contextPointers().filter((p) => p.channel === 'production'))
  readonly rate = computed(() => overviewRate(this.facade.contextLifecycleRecords()))
  readonly runs = computed(() =>
    [...this.facade.contextEvaluations()].sort(
      (a, b) => b.metrics.severeErrors - a.metrics.severeErrors || b.startedAt.localeCompare(a.startedAt)
    )
  )
  readonly severe = computed(() => this.runs().reduce((n, r) => n + r.metrics.severeErrors, 0))
  readonly tasks = computed(() =>
    overviewTasks(
      this.facade.contextLifecycleRecords(),
      this.facade.contextProposals(),
      this.facade.contextTargets(),
      this.runs(),
      (record) => this.recordTitle(record)
    )
  )
  readonly live = computed(() =>
    activeImprovement(
      this.productionPointers(),
      this.facade.contextReleases(),
      this.facade.dashboard().deployments,
      this.facade.contextLifecycleRecords()
    )
  )
  readonly tones = {
    muted: 'bg-muted text-muted-foreground',
    danger: 'bg-destructive/10 text-text-destructive',
    warning: 'bg-warning/10 text-text-warning',
    info: 'bg-accent text-accent-foreground'
  }
  readonly stages = computed(() => [
    { name: 'LearningSignals', value: this.facade.contextEvents().length, icon: 'ri-radar-line' },
    { name: 'ImprovementProposals', value: this.facade.contextProposals().length, icon: 'ri-lightbulb-line' },
    {
      name: 'CandidateVersions',
      value: this.facade.contextLifecycleRecords().filter((r) => r.candidate).length,
      icon: 'ri-flask-line'
    },
    {
      name: 'ReleaseRuns',
      value: this.facade.contextLifecycleRecords().filter((r) => r.publication).length,
      icon: 'ri-rocket-line'
    },
    { name: 'ProductionPointers', value: this.productionPointers().length, icon: 'ri-git-branch-line' }
  ])
  constructor() {
    afterNextRender(() => {
      this.scroll().nativeElement.scrollTop = this.facade.overviewScrollTop
    })
  }
  ngOnDestroy() {
    this.facade.overviewScrollTop = this.scroll().nativeElement.scrollTop
  }
  selectTarget(id: string | null) {
    this.facade.selectTarget(id || 'all')
    this.historyOpen.set(false)
    this.scroll().nativeElement.scrollTop = 0
  }
}
