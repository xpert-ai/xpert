import { CommonModule, DOCUMENT } from '@angular/common'
import { Component, computed, inject, input, output } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { injectTheme } from '@cloud/app/@core/theme'
import { EchartsDirective } from '@cloud/app/@shared/charts/echarts.directive'
import type { EChartsOption } from 'echarts'
import type { ReleaseDeployment } from '@xpert-ai/contracts'
import { ZardButtonComponent } from '@xpert-ai/headless-ui'
import { readAgentEvolutionChartTheme } from '../agent-evolution-chart-theme'
import { releaseTrendPoints } from './release-inspection'

@Component({
  selector: 'xp-release-trend',
  standalone: true,
  imports: [CommonModule, TranslateModule, EchartsDirective, ZardButtonComponent],
  templateUrl: './release-trend.component.html'
})
export class ReleaseTrendComponent {
  readonly stages = input.required<ReleaseDeployment[]>()
  readonly inspect = output<string>()
  readonly prefix = 'XP.AgentEvolution.ReleaseWorkbench.'
  private readonly translate = inject(TranslateService)
  private readonly lang = toSignal(this.translate.onLangChange)
  private readonly theme = injectTheme()
  private readonly doc = inject(DOCUMENT)
  readonly points = computed(() => releaseTrendPoints(this.stages()))
  readonly samples = computed(() => this.stages().reduce((n, s) => n + s.sampleCount, 0))
  readonly errors = computed(() => this.stages().reduce((n, s) => n + s.severeErrors, 0))
  readonly hasBaseline = computed(() => this.points().some((p) => p.baseline != null))
  label(s: ReleaseDeployment) {
    this.lang()
    return s.channel === 'canary'
      ? this.translate.instant(this.prefix + 'Canary', { n: s.canaryPercent })
      : this.translate.instant(this.prefix + (s.channel === 'production' ? 'Production' : 'Shadow'))
  }
  readonly options = computed<EChartsOption>(() => {
    this.theme()
    this.lang()
    const color = readAgentEvolutionChartTheme(this.doc),
      points = this.points()
    const baseline = this.translate.instant(this.prefix + 'Baseline'),
      candidate = this.translate.instant('XP.AgentEvolution.CandidateAccuracy')
    return {
      animation: false,
      color: [color.production, color.candidate],
      tooltip: { trigger: 'axis', valueFormatter: (v) => (v == null ? '—' : v + '%') },
      legend: { right: 4, top: 0, textStyle: { color: color.label } },
      grid: { left: 48, right: 16, top: 44, bottom: 44 },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: points.map((p) => this.label(p.stage) + ' · ' + p.point.sampleCount),
        axisLabel: { color: color.muted, hideOverlap: true }
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 100,
        axisLabel: { color: color.muted, formatter: '{value}%' },
        splitLine: { lineStyle: { color: color.divider, opacity: 0.3 } }
      },
      series: [
        {
          name: baseline,
          type: 'line',
          connectNulls: false,
          data: points.map((p) => (p.baseline == null ? null : +(p.baseline * 100).toFixed(2)))
        },
        { name: candidate, type: 'line', data: points.map((p) => +(p.point.candidateAccuracy * 100).toFixed(2)) }
      ]
    }
  })
}
