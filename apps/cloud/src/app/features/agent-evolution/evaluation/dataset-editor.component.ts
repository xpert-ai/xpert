import { Component, inject, input, output, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import type { GoldenCaseRevision, EvolutionCandidate, EvolutionTargetDescriptor } from '@xpert-ai/contracts'
import { ZardButtonComponent, ZardInputDirective } from '@xpert-ai/headless-ui'
import { AgentEvolutionFacade } from '../agent-evolution.facade'
@Component({
  selector: 'xp-replay-dataset-editor',
  standalone: true,
  imports: [FormsModule, TranslateModule, ZardButtonComponent, ZardInputDirective],
  templateUrl: './dataset-editor.component.html'
})
export class DatasetEditorComponent {
  readonly facade = inject(AgentEvolutionFacade)
  readonly #translate = inject(TranslateService)
  readonly candidate = input.required<EvolutionCandidate>()
  readonly candidateTarget = input<EvolutionTargetDescriptor>()
  readonly closed = output<void>()
  readonly created = output<string>()
  readonly datasetId = signal('')
  readonly datasetName = signal('')
  readonly evaluatorVersion = signal('')
  readonly metricDefinitionVersion = signal('')
  readonly datasetCasesJson = signal('[]')
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
    if (dataset) this.created.emit(dataset.snapshotId)
  }

  async importDatasetFile(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return
    this.datasetCasesJson.set(await file.text())
    input.value = ''
  }
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
