import { CommonModule } from '@angular/common'
import { DOCUMENT } from '@angular/common'
import { Component, computed, inject, signal } from '@angular/core'
import { injectTheme } from '@cloud/app/@core/theme'
import { EchartsDirective } from '@cloud/app/@shared/charts/echarts.directive'
import type { ReplayCaseResult } from '@xpert-ai/contracts'
import { ZardAlertDialogService, ZardBadgeComponent, ZardButtonComponent, ZardCardImports } from '@xpert-ai/headless-ui'
import { TranslateService } from '@ngx-translate/core'
import type { EChartsOption } from 'echarts'
import { firstValueFrom } from 'rxjs'
import { readAgentEvolutionChartTheme } from '../agent-evolution-chart-theme'
import { AgentEvolutionFacade } from '../agent-evolution.facade'
import { percent, shortId } from '../agent-evolution.types'

@Component({
  standalone: true,
  selector: 'xp-agent-evolution-evaluation',
  imports: [CommonModule, EchartsDirective, ZardBadgeComponent, ZardButtonComponent, ...ZardCardImports],
  templateUrl: './evaluation.component.html',
  host: { class: 'block' }
})
export class AgentEvolutionEvaluationComponent {
  readonly facade = inject(AgentEvolutionFacade)
  readonly #alertDialog = inject(ZardAlertDialogService)
  readonly #translate = inject(TranslateService)
  readonly #document = inject(DOCUMENT)
  readonly #theme = injectTheme()

  readonly percent = percent
  readonly shortId = shortId
  readonly selectedCaseId = signal<string | null>(null)

  readonly evaluation = this.facade.latestEvaluation
  readonly candidate = this.facade.latestCandidate
  readonly selectedCase = computed<ReplayCaseResult | null>(() => {
    const cases = this.evaluation()?.caseResults ?? []
    return cases.find((item) => item.caseId === this.selectedCaseId()) ?? cases[0] ?? null
  })

  readonly comparisonOptions = computed<EChartsOption>(() => {
    this.#theme()
    const chartTheme = readAgentEvolutionChartTheme(this.#document)
    const metrics = this.evaluation()?.metrics
    const baselineAccuracy = (metrics?.baselineAccuracy ?? 0) * 100
    const candidateAccuracy = (metrics?.candidateAccuracy ?? 0) * 100
    const baselineFailure = 100 - baselineAccuracy
    const candidateFailure = 100 - candidateAccuracy
    return {
      animationDuration: 350,
      color: [chartTheme.production, chartTheme.candidate],
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { right: 8, top: 0, textStyle: { color: chartTheme.label, fontSize: 11 } },
      grid: { left: 104, right: 20, top: 38, bottom: 24 },
      xAxis: {
        type: 'value',
        max: 100,
        axisLabel: { formatter: '{value}%', color: chartTheme.muted, fontSize: 10 },
        splitLine: { lineStyle: { color: chartTheme.divider, opacity: 0.18 } }
      },
      yAxis: {
        type: 'category',
        data: ['未映射率（越低越好）', '字段准确率'],
        axisLabel: { color: chartTheme.label, fontSize: 11 },
        axisTick: { show: false },
        axisLine: { show: false }
      },
      series: [
        { name: 'Production', type: 'bar', barWidth: 12, data: [baselineFailure, baselineAccuracy] },
        { name: 'Candidate', type: 'bar', barWidth: 12, data: [candidateFailure, candidateAccuracy] }
      ]
    }
  })

  selectCase(result: ReplayCaseResult) {
    this.selectedCaseId.set(result.caseId)
  }

  async rerun() {
    const confirmed = await firstValueFrom(
      this.#alertDialog.confirm({
        title: this.#translate.instant('XP.AgentEvolution.RerunEvaluationTitle', {
          Default: '重新执行候选评测？'
        }),
        description: this.#translate.instant('XP.AgentEvolution.RerunEvaluationDescription', {
          Default: '将重新生成一致性候选并以固定快照和随机种子回放黄金数据集，随后执行完整发布门禁。'
        }),
        actionText: this.#translate.instant('XP.AgentEvolution.Rerun', { Default: '重新执行' }),
        cancelText: this.#translate.instant('XP.ACTIONS.Cancel', { Default: '取消' })
      })
    )
    if (confirmed) {
      await this.facade.runSimulation()
    }
  }

  outputEntries(value: Record<string, string | number | boolean>) {
    return Object.entries(value)
  }
}
