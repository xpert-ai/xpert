import { CommonModule } from '@angular/common'
import { DOCUMENT } from '@angular/common'
import { Component, computed, inject, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { injectTheme } from '@cloud/app/@core/theme'
import { Store } from '@cloud/app/@core'
import { EchartsDirective } from '@cloud/app/@shared/charts/echarts.directive'
import type { GoldenCaseRevision, ReplayCaseResult } from '@xpert-ai/contracts'
import {
  ZardAlertDialogService,
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardCardImports,
  ZardComboboxComponent,
  ZardInputDirective
} from '@xpert-ai/headless-ui'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import type { EChartsOption } from 'echarts'
import { firstValueFrom } from 'rxjs'
import { startWith } from 'rxjs/operators'
import { readAgentEvolutionChartTheme } from '../agent-evolution-chart-theme'
import { AgentEvolutionFacade } from '../agent-evolution.facade'
import { evolutionApprovalGatePresentation, percent, shortId } from '../agent-evolution.types'

@Component({
  standalone: true,
  selector: 'xp-agent-evolution-evaluation',
  imports: [
    CommonModule,
    FormsModule,
    EchartsDirective,
    TranslateModule,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardComboboxComponent,
    ZardInputDirective,
    ...ZardCardImports
  ],
  templateUrl: './evaluation.component.html',
  host: { class: 'block' }
})
export class AgentEvolutionEvaluationComponent {
  readonly facade = inject(AgentEvolutionFacade)
  readonly #alertDialog = inject(ZardAlertDialogService)
  readonly #translate = inject(TranslateService)
  readonly #document = inject(DOCUMENT)
  readonly #theme = injectTheme()
  readonly #store = inject(Store)

  readonly percent = percent
  readonly shortId = shortId
  readonly selectedCaseId = signal<string | null>(null)
  readonly showDatasetBuilder = signal(false)
  readonly datasetId = signal('')
  readonly datasetName = signal('')
  readonly evaluatorVersion = signal('bom-provider-replay-v1')
  readonly metricDefinitionVersion = signal('')
  readonly datasetCasesJson = signal('[]')
  readonly approvalReason = signal(this.#translate.instant('XP.AgentEvolution.DefaultApprovalReason'))
  readonly localeChange = toSignal(this.#translate.onLangChange.pipe(startWith(null)), { initialValue: null })
  readonly currentUser = toSignal(this.#store.user$, { initialValue: this.#store.user })

  readonly evaluation = this.facade.latestEvaluation
  readonly candidate = this.facade.latestCandidate
  readonly candidateTarget = computed(
    () => this.facade.dashboard().targets.find((target) => target.targetId === this.candidate()?.targetId) ?? null
  )
  readonly compatibleDatasets = computed(() => {
    const candidate = this.candidate()
    if (!candidate) return []
    return this.facade
      .contextDatasets()
      .filter((dataset) => dataset.targetId === candidate.targetId && sameScope(dataset.scope, candidate.targetScope))
  })
  readonly candidateOptions = computed(() => {
    this.localeChange()
    return this.facade.contextCandidates().map((item) => ({
      value: item.candidateId,
      label: `${item.targetId} · ${item.candidateId} · ${this.#translate.instant(`XP.AgentEvolution.Status.${item.status}`, { Default: item.status })}`
    }))
  })
  readonly datasetOptions = computed(() => {
    this.localeChange()
    return this.compatibleDatasets().map((item) => ({
      value: item.snapshotId,
      label: this.#translate.instant('XP.AgentEvolution.DatasetOptionLabel', {
        name: item.name,
        count: item.cases.length
      })
    }))
  })
  readonly dataset = computed(
    () =>
      this.compatibleDatasets().find((item) => item.snapshotId === this.facade.selectedDatasetSnapshotId()) ??
      this.compatibleDatasets()[0] ??
      null
  )
  readonly approvals = computed(() => {
    const candidate = this.candidate()
    const evaluation = this.evaluation()
    return this.facade
      .dashboard()
      .approvals.filter(
        (approval) =>
          approval.candidateId === candidate?.candidateId &&
          approval.evaluationRunId === evaluation?.runId &&
          approval.decision === 'approved'
      )
  })
  readonly approvalGate = computed(() =>
    evolutionApprovalGatePresentation(
      this.candidateTarget()?.riskLevel,
      this.approvals(),
      this.currentUser()?.role?.name
    )
  )
  readonly requiredApprovals = computed(() => this.approvalGate().requiredApprovals)
  readonly canPackage = computed(
    () =>
      this.candidate()?.status === 'approved' &&
      this.evaluation()?.gate.passed === true &&
      this.candidateTarget()?.capabilities.install === true &&
      this.approvalGate().passed
  )
  readonly selectedCase = computed<ReplayCaseResult | null>(() => {
    const cases = this.evaluation()?.caseResults ?? []
    return cases.find((item) => item.caseId === this.selectedCaseId()) ?? cases[0] ?? null
  })

  readonly comparisonOptions = computed<EChartsOption>(() => {
    this.#theme()
    this.localeChange()
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
        data: [
          this.#translate.instant('XP.AgentEvolution.UnmappedRateLowerBetter'),
          this.#translate.instant('XP.AgentEvolution.FieldAccuracy')
        ],
        axisLabel: { color: chartTheme.label, fontSize: 11 },
        axisTick: { show: false },
        axisLine: { show: false }
      },
      series: [
        {
          name: this.#translate.instant('XP.AgentEvolution.Production'),
          type: 'bar',
          barWidth: 12,
          data: [baselineFailure, baselineAccuracy]
        },
        {
          name: this.#translate.instant('XP.AgentEvolution.Candidate'),
          type: 'bar',
          barWidth: 12,
          data: [candidateFailure, candidateAccuracy]
        }
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
          Default: '将使用当前 Ready Candidate 和固定 Golden Dataset Snapshot 启动隔离回放，不会触发审批或发布。'
        }),
        actionText: this.#translate.instant('XP.AgentEvolution.Rerun', { Default: '重新执行' }),
        cancelText: this.#translate.instant('XP.ACTIONS.Cancel', { Default: '取消' })
      })
    )
    if (confirmed) {
      await this.facade.evaluateCandidate(this.candidate(), this.dataset())
    }
  }

  selectCandidate(candidateId: string) {
    this.facade.selectedCandidateId.set(candidateId || null)
    this.facade.selectedDatasetSnapshotId.set(null)
    this.facade.selectedEvaluationRunId.set(null)
    this.selectedCaseId.set(null)
  }

  selectDataset(snapshotId: string) {
    this.facade.selectedDatasetSnapshotId.set(snapshotId || null)
  }

  async createDataset() {
    const candidate = this.candidate()
    if (!candidate) return
    let cases: GoldenCaseRevision[]
    try {
      cases = parseGoldenCases(this.datasetCasesJson(), (key, params) => this.#translate.instant(key, params))
    } catch (error) {
      this.facade.error.set(
        error instanceof Error ? error.message : this.#translate.instant('XP.AgentEvolution.InvalidGoldenDatasetJson')
      )
      return
    }
    const dataset = await this.facade.createDataset({
      datasetId: this.datasetId().trim() || `${candidate.targetId}.golden`,
      targetId: candidate.targetId,
      scope: candidate.targetScope,
      name:
        this.datasetName().trim() ||
        this.#translate.instant('XP.AgentEvolution.DefaultDatasetName', {
          target: this.candidateTarget()?.displayName ?? candidate.targetId
        }),
      evaluatorVersion: this.evaluatorVersion().trim(),
      metricDefinitionVersion:
        this.metricDefinitionVersion().trim() || this.candidateTarget()?.metricSetId || 'default-metrics-v1',
      cases
    })
    if (dataset) this.showDatasetBuilder.set(false)
  }

  async importDatasetFile(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return
    this.datasetCasesJson.set(await file.text())
    input.value = ''
  }

  async approve() {
    const candidate = this.candidate()
    const evaluation = this.evaluation()
    if (!candidate || !evaluation || !this.approvalReason().trim()) return
    const confirmed = await firstValueFrom(
      this.#alertDialog.confirm({
        title: this.#translate.instant('XP.AgentEvolution.SubmitApprovalTitle'),
        description: this.#translate.instant(
          this.approvalGate().administratorPath
            ? 'XP.AgentEvolution.AdministratorSubmitApprovalDescription'
            : 'XP.AgentEvolution.SubmitApprovalDescription',
          { count: this.requiredApprovals() }
        ),
        actionText: this.#translate.instant('XP.AgentEvolution.ConfirmApproval'),
        cancelText: this.#translate.instant('XP.ACTIONS.Cancel', { Default: '取消' })
      })
    )
    if (confirmed) await this.facade.approveCandidate(candidate.candidateId, evaluation.runId, this.approvalReason())
  }

  async reject() {
    const candidate = this.candidate()
    const evaluation = this.evaluation()
    if (!candidate || !evaluation || !this.approvalReason().trim()) return
    const confirmed = await firstValueFrom(
      this.#alertDialog.confirm({
        title: this.#translate.instant('XP.AgentEvolution.RejectCandidateTitle'),
        description: this.#translate.instant('XP.AgentEvolution.RejectCandidateDescription'),
        actionText: this.#translate.instant('XP.AgentEvolution.ConfirmReject'),
        cancelText: this.#translate.instant('XP.ACTIONS.Cancel', { Default: '取消' })
      })
    )
    if (confirmed) await this.facade.rejectCandidate(candidate.candidateId, evaluation.runId, this.approvalReason())
  }

  async packageRelease() {
    const candidate = this.candidate()
    const evaluation = this.evaluation()
    if (!candidate || !evaluation || !this.canPackage()) return
    const confirmed = await firstValueFrom(
      this.#alertDialog.confirm({
        title: this.#translate.instant('XP.AgentEvolution.CreateReleasePackageTitle'),
        description: this.#translate.instant('XP.AgentEvolution.CreateReleasePackageDescription'),
        actionText: this.#translate.instant('XP.AgentEvolution.CreateReleasePackage'),
        cancelText: this.#translate.instant('XP.ACTIONS.Cancel', { Default: '取消' })
      })
    )
    if (confirmed) {
      await this.facade.packageRelease(
        candidate.candidateId,
        evaluation.runId,
        this.approvals().map((item) => item.approvalId)
      )
    }
  }

  outputEntries(value: Record<string, string | number | boolean>) {
    return Object.entries(value)
  }
}

function sameScope(
  left: import('@xpert-ai/contracts').EvolutionScope | undefined,
  right: import('@xpert-ai/contracts').EvolutionScope
) {
  if (!left) return false
  const dimensions = (value: import('@xpert-ai/contracts').EvolutionScope) =>
    JSON.stringify(Object.entries(value.dimensions ?? {}).sort(([a], [b]) => a.localeCompare(b)))
  return left.type === right.type && left.key === right.key && dimensions(left) === dimensions(right)
}

function parseGoldenCases(
  value: string,
  translate: (key: string, params?: Record<string, string | number>) => string
): GoldenCaseRevision[] {
  const parsed: unknown = JSON.parse(value)
  if (!Array.isArray(parsed) || !parsed.length) throw new Error(translate('XP.AgentEvolution.DatasetRequiresCase'))
  return parsed.map((item, index) => {
    if (!isRecord(item)) throw new Error(translate('XP.AgentEvolution.CaseMustBeObject', { index: index + 1 }))
    if (typeof item['caseId'] !== 'string' || typeof item['revision'] !== 'number') {
      throw new Error(translate('XP.AgentEvolution.CaseMissingIdentity', { index: index + 1 }))
    }
    if (!isScalarRecord(item['input']) || !isScalarRecord(item['expected'])) {
      throw new Error(translate('XP.AgentEvolution.CaseRequiresScalarObjects', { index: index + 1 }))
    }
    const risk = item['risk']
    if (risk !== 'low' && risk !== 'medium' && risk !== 'high') {
      throw new Error(translate('XP.AgentEvolution.CaseRiskInvalid', { index: index + 1 }))
    }
    return {
      caseId: item['caseId'],
      revision: item['revision'],
      input: item['input'],
      expected: item['expected'],
      slice: typeof item['slice'] === 'string' ? item['slice'] : 'stable',
      risk,
      evidenceRef: typeof item['evidenceRef'] === 'string' ? item['evidenceRef'] : `manual://${item['caseId']}`
    }
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isScalarRecord(value: unknown): value is Record<string, string | number | boolean> {
  return isRecord(value) && Object.values(value).every((item) => ['string', 'number', 'boolean'].includes(typeof item))
}
