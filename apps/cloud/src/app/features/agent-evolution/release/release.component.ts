import { CommonModule } from '@angular/common'
import { DOCUMENT } from '@angular/common'
import { Component, computed, inject } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { injectTheme } from '@cloud/app/@core/theme'
import { EchartsDirective } from '@cloud/app/@shared/charts/echarts.directive'
import {
  ZardAlertDialogService,
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardCardImports,
  ZardComboboxComponent
} from '@xpert-ai/headless-ui'
import type { EvolutionReleaseGatePolicy, ReleaseDeployment, ReleaseRuntimeObservation } from '@xpert-ai/contracts'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import type { EChartsOption } from 'echarts'
import { firstValueFrom } from 'rxjs'
import { startWith } from 'rxjs/operators'
import { readAgentEvolutionChartTheme } from '../agent-evolution-chart-theme'
import { AgentEvolutionFacade } from '../agent-evolution.facade'
import { percent, sameEvolutionScope, shortId } from '../agent-evolution.types'

interface RuntimePoint extends ReleaseRuntimeObservation {
  channel: string
  dataSource: 'deterministic_replay' | 'runtime_telemetry'
}

interface ReleaseAction {
  label: string
  description: string
  enabled: boolean
}

const LEGACY_STANDARD_GATE_POLICY: EvolutionReleaseGatePolicy = {
  profile: 'standard',
  shadowMinimumSamples: 100,
  shadowMinimumDurationHours: 72,
  canaryMinimumSamples: 30,
  canaryMinimumDurationHours: 24,
  productionCanaryMinimumSamples: 30,
  productionCanaryMinimumDurationHours: 24,
  experienceMinimumSamples: 100,
  experienceMinimumDurationHours: 168
}

@Component({
  standalone: true,
  selector: 'xp-agent-evolution-release',
  imports: [
    CommonModule,
    FormsModule,
    EchartsDirective,
    TranslateModule,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardComboboxComponent,
    ...ZardCardImports
  ],
  templateUrl: './release.component.html',
  host: { class: 'block' }
})
export class AgentEvolutionReleaseComponent {
  readonly facade = inject(AgentEvolutionFacade)
  readonly #alertDialog = inject(ZardAlertDialogService)
  readonly #translate = inject(TranslateService)
  readonly #document = inject(DOCUMENT)
  readonly #theme = injectTheme()
  readonly localeChange = toSignal(this.#translate.onLangChange.pipe(startWith(null)), { initialValue: null })

  readonly percent = percent
  readonly shortId = shortId
  readonly release = this.facade.latestRelease
  readonly gatePolicy = computed(() => this.release()?.gatePolicy ?? LEGACY_STANDARD_GATE_POLICY)
  readonly releaseOptions = computed(() => {
    this.localeChange()
    return this.facade.contextReleases().map((item) => ({
      value: item.releasePackageId,
      label: `${item.targetId} · ${item.targetVersionId} · ${this.#translate.instant(`XP.AgentEvolution.Status.${item.status}`, { Default: item.status })}`
    }))
  })
  readonly evaluation = computed(() => {
    const release = this.release()
    return (
      this.facade.dashboard().evaluations.find((evaluation) => evaluation.runId === release?.evaluationRunId) ?? null
    )
  })
  readonly targetName = computed(() => {
    this.localeChange()
    const release = this.release()
    return (
      this.facade.dashboard().targets.find((target) => target.targetId === release?.targetId)?.displayName ??
      release?.targetId ??
      this.#translate.instant('XP.AgentEvolution.Capability')
    )
  })
  readonly target = computed(() => {
    const release = this.release()
    return this.facade.dashboard().targets.find((target) => target.targetId === release?.targetId) ?? null
  })
  readonly pointer = computed(() => {
    const release = this.release()
    if (!release) return null
    return (
      this.facade
        .dashboard()
        .pointers.find(
          (pointer) => pointer.targetId === release.targetId && sameEvolutionScope(pointer.scope, release.scope)
        ) ?? null
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
    this.localeChange()
    const sources = [...new Set(this.runtimePoints().map((point) => point.dataSource))]
    return (
      sources
        .map((source) =>
          this.#translate.instant(`XP.AgentEvolution.DataSourceType.${source}`, {
            Default: source
          })
        )
        .join(' + ') || this.#translate.instant('XP.AgentEvolution.NoRuntimeObservations')
    )
  })
  readonly releaseDecision = computed(() => {
    this.localeChange()
    const release = this.release()
    const activePointer = this.pointer()
    const governedDeployments = this.deployments().filter((deployment) => deployment.channel !== 'production')
    const deploymentGatePassed =
      governedDeployments.length > 0 &&
      governedDeployments.every((deployment) => !!deployment.completedAt && deployment.severeErrors === 0)
    const passed =
      release?.status === 'active' &&
      this.evaluation()?.gate.passed === true &&
      deploymentGatePassed &&
      activePointer?.activeVersionId === release.targetVersionId
    return {
      passed,
      label: this.#translate.instant(passed ? 'XP.AgentEvolution.KeepActive' : 'XP.AgentEvolution.WaitingForGates'),
      detail: this.#translate.instant(
        passed ? 'XP.AgentEvolution.ReleaseDecisionPassedDetail' : 'XP.AgentEvolution.ReleaseDecisionPendingDetail'
      )
    }
  })
  readonly primaryAction = computed<ReleaseAction | null>(() => {
    this.localeChange()
    const release = this.release()
    const target = this.target()
    if (!release) return null
    if (release.status === 'approved' && target?.capabilities.install)
      return this.releaseAction('InstallImmutableVersion')
    if (release.status === 'installed' && target?.capabilities.shadow) return this.releaseAction('StartShadow')
    if (release.status === 'shadow' && target?.capabilities.canary) {
      const policy = this.gatePolicy()
      return this.releaseAction(
        'StartCanary5',
        deploymentGatePassed(
          this.deployments().at(-1),
          'shadow',
          policy.shadowMinimumSamples,
          policy.shadowMinimumDurationHours
        )
      )
    }
    if (release.status === 'canary' && release.canaryPercent < 50) {
      const percent = release.canaryPercent === 5 ? 25 : 50
      const policy = this.gatePolicy()
      return {
        label: this.#translate.instant('XP.AgentEvolution.ExpandCanary', { percent }),
        description: this.#translate.instant('XP.AgentEvolution.ExpandCanaryDescription'),
        enabled: deploymentGatePassed(
          this.deployments().at(-1),
          'canary',
          policy.canaryMinimumSamples,
          policy.canaryMinimumDurationHours
        )
      }
    }
    if (release.status === 'canary') {
      const policy = this.gatePolicy()
      return this.releaseAction(
        'ActivateProduction',
        deploymentGatePassed(
          this.deployments().at(-1),
          'canary',
          policy.productionCanaryMinimumSamples,
          policy.productionCanaryMinimumDurationHours,
          50
        )
      )
    }
    if (
      release.status === 'active' &&
      !this.facade.dashboard().experiences.some((item) => item.sourceReleasePackageId === release.releasePackageId)
    ) {
      const policy = this.gatePolicy()
      const production = this.deployments().findLast((deployment) => deployment.channel === 'production')
      return this.releaseAction(
        'CreateStableExperience',
        deploymentGatePassed(
          production,
          'production',
          policy.experienceMinimumSamples,
          policy.experienceMinimumDurationHours
        )
      )
    }
    return null
  })

  private releaseAction(key: string, enabled = true): ReleaseAction {
    return {
      label: this.#translate.instant(`XP.AgentEvolution.${key}`),
      description: this.#translate.instant(`XP.AgentEvolution.${key}Description`),
      enabled
    }
  }

  readonly timeline = computed(() => {
    this.localeChange()
    const release = this.release()
    const deployments = this.deployments()
    const active = release?.status === 'active'
    return [
      {
        label: this.#translate.instant('XP.AgentEvolution.ApprovalPassed'),
        detail: release?.approvalIds.length
          ? this.#translate.instant('XP.AgentEvolution.ApproverCount', { count: release.approvalIds.length })
          : '—',
        done: !!release?.approvalIds.length
      },
      ...deployments.map((deployment) => ({
        label:
          deployment.channel === 'shadow'
            ? this.#translate.instant('XP.AgentEvolution.Shadow')
            : deployment.channel === 'canary'
              ? this.#translate.instant('XP.AgentEvolution.CanaryPercent', { percent: deployment.canaryPercent })
              : this.#translate.instant('XP.AgentEvolution.ProductionTelemetry'),
        detail: this.#translate.instant('XP.AgentEvolution.SampleCount', { count: deployment.sampleCount }),
        done: !!deployment.completedAt && deployment.severeErrors === 0
      })),
      {
        label: this.#translate.instant('XP.AgentEvolution.Production'),
        detail: this.#translate.instant(
          active ? 'XP.AgentEvolution.PointerSwitched' : 'XP.AgentEvolution.PendingActivation'
        ),
        done: active
      }
    ]
  })

  readonly runtimeOptions = computed<EChartsOption>(() => {
    this.#theme()
    this.localeChange()
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
        data: points.map(
          (point) =>
            `${this.#translate.instant(`XP.AgentEvolution.ChannelType.${point.channel}`, { Default: point.channel })} · ${point.sampleCount}`
        ),
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
          name: this.#translate.instant('XP.AgentEvolution.Production'),
          type: 'line',
          smooth: true,
          symbolSize: 6,
          data: points.map((point) => Number((point.baselineAccuracy * 100).toFixed(2)))
        },
        {
          name: this.#translate.instant('XP.AgentEvolution.Candidate'),
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

  async performPrimaryAction() {
    const release = this.release()
    const action = this.primaryAction()
    if (!release || !action || !action.enabled) return
    const confirmed = await firstValueFrom(
      this.#alertDialog.confirm({
        title: this.#translate.instant('XP.AgentEvolution.NextReleaseTitle', {
          Default: `${action.label}？`
        }),
        description: this.#translate.instant('XP.AgentEvolution.NextReleaseDescription', {
          Default: action.description
        }),
        actionText: this.#translate.instant('XP.AgentEvolution.ConfirmReleaseAction', { Default: action.label }),
        cancelText: this.#translate.instant('XP.ACTIONS.Cancel', { Default: '取消' })
      })
    )
    if (confirmed) await this.facade.runReleaseAction(release)
  }

  selectRelease(releasePackageId: string) {
    this.facade.selectedReleasePackageId.set(releasePackageId || null)
  }

  async pause() {
    const release = this.release()
    if (!release) return
    const confirmed = await firstValueFrom(
      this.#alertDialog.confirm({
        title: this.#translate.instant('XP.AgentEvolution.PauseReleaseTitle'),
        description: this.#translate.instant('XP.AgentEvolution.PauseReleaseDescription'),
        actionText: this.#translate.instant('XP.AgentEvolution.PauseReleaseAction'),
        cancelText: this.#translate.instant('XP.ACTIONS.Cancel', { Default: '取消' })
      })
    )
    if (confirmed) await this.facade.pauseRelease(release.releasePackageId)
  }

  async rollback() {
    const release = this.release()
    if (!release) return
    const confirmed = await firstValueFrom(
      this.#alertDialog.confirm({
        title: this.#translate.instant('XP.AgentEvolution.RollbackTitle'),
        description: this.#translate.instant('XP.AgentEvolution.RollbackDescription', {
          from: release.targetVersionId,
          to: release.rollbackVersionId
        }),
        actionText: this.#translate.instant('XP.AgentEvolution.RollbackAction'),
        cancelText: this.#translate.instant('XP.ACTIONS.Cancel', { Default: '取消' })
      })
    )
    if (confirmed) await this.facade.rollbackRelease(release.releasePackageId)
  }
}

function deploymentGatePassed(
  deployment: ReleaseDeployment | undefined,
  channel: ReleaseDeployment['channel'],
  minimumSamples: number,
  minimumDurationHours: number,
  canaryPercent?: number
) {
  if (!deployment || deployment.channel !== channel || deployment.severeErrors > 0) return false
  if (canaryPercent !== undefined && deployment.canaryPercent !== canaryPercent) return false
  if (deployment.sampleCount < minimumSamples) return false
  const startedAt = Date.parse(deployment.startedAt)
  return Number.isFinite(startedAt) && Date.now() - startedAt >= minimumDurationHours * 60 * 60 * 1000
}
