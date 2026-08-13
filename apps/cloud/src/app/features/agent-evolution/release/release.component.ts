import { CommonModule } from '@angular/common'
import { DOCUMENT } from '@angular/common'
import { Component, computed, inject } from '@angular/core'
import { injectTheme } from '@cloud/app/@core/theme'
import { EchartsDirective } from '@cloud/app/@shared/charts/echarts.directive'
import { ZardAlertDialogService, ZardBadgeComponent, ZardButtonComponent, ZardCardImports } from '@xpert-ai/headless-ui'
import type { ReleaseRuntimeObservation } from '@xpert-ai/contracts'
import { TranslateService } from '@ngx-translate/core'
import type { EChartsOption } from 'echarts'
import { firstValueFrom } from 'rxjs'
import { readAgentEvolutionChartTheme } from '../agent-evolution-chart-theme'
import { AgentEvolutionFacade } from '../agent-evolution.facade'
import { percent, shortId } from '../agent-evolution.types'

interface RuntimePoint extends ReleaseRuntimeObservation {
  channel: string
  dataSource: 'deterministic_replay' | 'runtime_telemetry'
}

@Component({
  standalone: true,
  selector: 'xp-agent-evolution-release',
  imports: [CommonModule, EchartsDirective, ZardBadgeComponent, ZardButtonComponent, ...ZardCardImports],
  templateUrl: './release.component.html',
  host: { class: 'block' }
})
export class AgentEvolutionReleaseComponent {
  readonly facade = inject(AgentEvolutionFacade)
  readonly #alertDialog = inject(ZardAlertDialogService)
  readonly #translate = inject(TranslateService)
  readonly #document = inject(DOCUMENT)
  readonly #theme = injectTheme()

  readonly percent = percent
  readonly shortId = shortId
  readonly release = this.facade.latestRelease
  readonly evaluation = this.facade.latestEvaluation
  readonly pointer = computed(() => {
    const release = this.release()
    return (
      this.facade
        .dashboard()
        .pointers.find((pointer) => !release || pointer.releasePackageId === release.releasePackageId) ??
      this.facade.dashboard().pointers[0] ??
      null
    )
  })
  readonly deployments = computed(() => {
    const release = this.release()
    return this.facade
      .dashboard()
      .deployments.filter((deployment) => !release || deployment.releasePackageId === release.releasePackageId)
      .sort((left, right) => left.startedAt.localeCompare(right.startedAt))
  })
  readonly auditEvents = computed(() => {
    const release = this.release()
    return this.facade
      .dashboard()
      .audits.filter((audit) => !release || audit.releasePackageId === release.releasePackageId)
      .slice(0, 12)
  })
  readonly totalSamples = computed(() =>
    this.deployments().reduce((sum, deployment) => sum + deployment.sampleCount, 0)
  )
  readonly severeErrors = computed(() => this.deployments().reduce((sum, item) => sum + item.severeErrors, 0))
  readonly runtimePoints = computed<RuntimePoint[]>(() =>
    this.deployments().flatMap((deployment) => {
      if (deployment.observations?.length) {
        return deployment.observations.map((observation) => ({
          ...observation,
          channel: deployment.channel,
          dataSource: deployment.dataSource
        }))
      }
      return [
        {
          observationId: `${deployment.deploymentId}-aggregate`,
          observedAt: deployment.completedAt ?? deployment.startedAt,
          sequence: 1,
          sampleCount: deployment.sampleCount,
          baselineAccuracy: this.evaluation()?.metrics.baselineAccuracy ?? 0,
          candidateAccuracy: deployment.candidateAccuracy,
          severeErrors: deployment.severeErrors,
          p95LatencyMs: this.evaluation()?.metrics.p95LatencyMs ?? 0,
          averageCost: this.evaluation()?.metrics.averageCost ?? 0,
          channel: deployment.channel,
          dataSource: deployment.dataSource ?? 'deterministic_replay'
        }
      ]
    })
  )
  readonly latestAccuracy = computed(
    () => this.runtimePoints().at(-1)?.candidateAccuracy ?? this.evaluation()?.metrics.candidateAccuracy ?? 0
  )
  readonly runtimeDataSource = computed(() => {
    const sources = [...new Set(this.runtimePoints().map((point) => point.dataSource))]
    return sources.join(' + ') || '暂无运行观测'
  })
  readonly releaseDecision = computed(() => {
    const release = this.release()
    const activePointer = this.pointer()
    const deploymentGatePassed =
      this.deployments().length > 0 &&
      this.deployments().every((deployment) => !!deployment.completedAt && deployment.severeErrors === 0)
    const passed =
      release?.status === 'active' &&
      this.evaluation()?.gate.passed === true &&
      deploymentGatePassed &&
      activePointer?.activeVersionId === release.targetVersionId
    return {
      passed,
      label: passed ? '保持 Active' : '等待门禁',
      detail: passed ? '评测、部署观测与 CAS 指针均已核验' : '尚未满足全部持久化门禁'
    }
  })

  readonly timeline = computed(() => {
    const release = this.release()
    const deployments = this.deployments()
    const active = release?.status === 'active'
    return [
      {
        label: '审批通过',
        detail: release?.approvalIds.length ? `${release.approvalIds.length} approver` : '—',
        done: !!release?.approvalIds.length
      },
      ...deployments.map((deployment) => ({
        label: deployment.channel === 'shadow' ? 'Shadow' : `Canary ${deployment.canaryPercent}%`,
        detail: `${deployment.sampleCount} samples`,
        done: !!deployment.completedAt && deployment.severeErrors === 0
      })),
      { label: 'Production', detail: active ? '指针已切换' : '待激活', done: active }
    ]
  })

  readonly runtimeOptions = computed<EChartsOption>(() => {
    this.#theme()
    const chartTheme = readAgentEvolutionChartTheme(this.#document)
    const points = this.runtimePoints()
    const accuracies = points.flatMap((point) => [point.baselineAccuracy * 100, point.candidateAccuracy * 100])
    const minimumAccuracy = accuracies.length ? Math.min(...accuracies) : 0
    return {
      animationDuration: 350,
      color: [chartTheme.production, chartTheme.candidate],
      tooltip: { trigger: 'axis' },
      legend: { right: 8, top: 0, textStyle: { color: chartTheme.label, fontSize: 11 } },
      grid: { left: 45, right: 18, top: 38, bottom: 28 },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: points.map((point) => `${point.channel} · ${point.sampleCount}`),
        axisLine: { lineStyle: { color: chartTheme.divider, opacity: 0.28 } },
        axisLabel: { color: chartTheme.muted, fontSize: 10 }
      },
      yAxis: {
        type: 'value',
        min: Math.max(0, Math.floor(minimumAccuracy - 5)),
        max: 100,
        axisLabel: { formatter: '{value}%', color: chartTheme.muted, fontSize: 10 },
        splitLine: { lineStyle: { color: chartTheme.divider, opacity: 0.18 } }
      },
      series: [
        {
          name: 'Production',
          type: 'line',
          smooth: true,
          symbolSize: 6,
          data: points.map((point) => Number((point.baselineAccuracy * 100).toFixed(2)))
        },
        {
          name: 'Candidate',
          type: 'line',
          smooth: true,
          symbol: 'none',
          lineStyle: { width: 2 },
          areaStyle: { opacity: 0.08 },
          data: points.map((point) => Number((point.candidateAccuracy * 100).toFixed(2)))
        }
      ]
    }
  })

  async startNextEvolution() {
    const confirmed = await firstValueFrom(
      this.#alertDialog.confirm({
        title: this.#translate.instant('XP.AgentEvolution.NextReleaseTitle', {
          Default: '开始下一轮完整进化模拟？'
        }),
        description: this.#translate.instant('XP.AgentEvolution.NextReleaseDescription', {
          Default:
            '将基于当前 Active Pointer 创建新的 immutable candidate，并再次执行 Replay、审批、Shadow、Canary 和 CAS 激活。'
        }),
        actionText: this.#translate.instant('XP.AgentEvolution.StartNextRound', { Default: '开始下一轮' }),
        cancelText: this.#translate.instant('XP.ACTIONS.Cancel', { Default: '取消' })
      })
    )
    if (confirmed) {
      await this.facade.runSimulation()
    }
  }
}
