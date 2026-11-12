import { CommonModule } from '@angular/common'
import { Component, inject, signal } from '@angular/core'
import { RouterLink } from '@angular/router'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import {
  resolveI18nText,
  type EvaluationRun,
  type EvolutionChange,
  type EvolutionLifecycleRecord,
  type EvolutionTargetDescriptor,
  type ImprovementProposal,
  type I18nText
} from '@xpert-ai/contracts'
import { ZardButtonComponent, ZardDialogRef, Z_MODAL_DATA } from '@xpert-ai/headless-ui'
import { EvolutionChangePanelComponent } from '../changes/change-panel.component'
import { displayOutput, caseOutcome } from '../evaluation/replay-presentation'
import { changeWorkbenchLink } from '../shared/evolution-change-presentation'

export type EvidenceView = 'identity' | 'source' | 'checks'
export interface ApprovalEvidenceData {
  view: EvidenceView
  change: EvolutionChange
  record?: EvolutionLifecycleRecord
  proposal?: ImprovementProposal
  replay: EvaluationRun | null
  target?: EvolutionTargetDescriptor
}
@Component({
  standalone: true,
  imports: [CommonModule, TranslateModule, RouterLink, ZardButtonComponent, EvolutionChangePanelComponent],
  templateUrl: './evidence-dialog.component.html'
})
export class ApprovalEvidenceDialog {
  readonly data = inject<ApprovalEvidenceData>(Z_MODAL_DATA)
  readonly ref = inject<ZardDialogRef<ApprovalEvidenceDialog>>(ZardDialogRef)
  readonly i18n = inject(TranslateService)
  readonly p = 'XP.AgentEvolution.Approval.'
  readonly c = this.data.change
  readonly link = changeWorkbenchLink(this.c, 'evaluation')
  readonly expanded = signal(false)
  readonly outcome = caseOutcome
  readonly identity = [
    ['Candidate', this.c.changeId],
    ['Fingerprint', this.c.candidate?.artifact?.hash],
    ['BoundAssessment', this.c.evaluation?.runId],
    ['Baseline', this.c.baseline.version],
    ['BaselineHash', this.c.baseline.hash],
    ['Strategy', this.c.strategy.hash],
    ['EvidenceHash', this.c.evidenceHash]
  ]
  txt(v?: I18nText) {
    return resolveI18nText(v, this.i18n.currentLang)
  }
  output(v: EvaluationRun['caseResults'][number]['baselineOutput']) {
    return displayOutput(v, this.data.target, this.i18n.currentLang)
  }
  localized(path: string, fallback: string) {
    const key = this.p + path,
      r = this.i18n.instant(key)
    return r === key ? fallback : r
  }
}
