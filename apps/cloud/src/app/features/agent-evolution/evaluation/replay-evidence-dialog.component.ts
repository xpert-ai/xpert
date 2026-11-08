import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { DatePipe, JsonPipe } from '@angular/common'
import { Component, computed, inject, signal } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import type { DatasetSnapshot, EvaluationRun, GoldenCaseRevision } from '@xpert-ai/contracts'
import { XpDialogFrameImports, ZardButtonComponent } from '@xpert-ai/headless-ui'

import { compactId } from './replay-presentation'

export type ReplayEvidence = { kind: 'raw' | 'snapshot'; run: EvaluationRun; snapshot?: DatasetSnapshot }
export type ReplaySelection = { id: string; index: number | null }

@Component({
  imports: [DatePipe, JsonPipe, TranslateModule, ZardButtonComponent, ...XpDialogFrameImports],
  templateUrl: './replay-evidence-dialog.component.html'
})
export class ReplayEvidenceDialog {
  readonly data = inject<ReplayEvidence>(DIALOG_DATA)
  readonly ref = inject<DialogRef<ReplaySelection>>(DialogRef)
  readonly p = 'XP.AgentEvolution.ReplayHistory.'
  readonly short = compactId
  readonly page = signal(1)
  readonly size = 5
  readonly pages = computed(() => Math.max(1, Math.ceil((this.data.snapshot?.cases.length ?? 0) / this.size)))
  readonly samples = computed(() =>
    (this.data.snapshot?.cases ?? [])
      .slice((this.page() - 1) * this.size, this.page() * this.size)
      .map((sample, offset) => {
        const position = (this.page() - 1) * this.size + offset
        return { sample, result: this.resultFor(sample, position) }
      })
  )
  private resultFor(sample: GoldenCaseRevision, position: number): ReplaySelection | null {
    const matches = this.data.run.caseResults.filter((r) => r.caseId === sample.caseId)
    if (!matches.length) return null
    // Repeated IDs at different revisions are bound by the frozen replay order.
    const repeated = this.data.snapshot!.cases.filter((c) => c.caseId === sample.caseId).length > 1
    if (repeated || matches.length > 1)
      return this.data.run.caseResults[position]?.caseId === sample.caseId
        ? { id: sample.caseId, index: position }
        : null
    return { id: sample.caseId, index: null }
  }
}
