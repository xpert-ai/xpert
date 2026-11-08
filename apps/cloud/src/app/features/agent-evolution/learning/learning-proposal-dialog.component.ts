import { HttpErrorResponse } from '@angular/common/http'
import { Component, DestroyRef, inject, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import type { ImprovementProposal, LearningEvent, LearningProposalCheck } from '@xpert-ai/contracts'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { ZardButtonComponent, ZardDialogRef, Z_MODAL_DATA } from '@xpert-ai/headless-ui'
import { AgentEvolutionApiService } from '../agent-evolution-api.service'

interface ProposalDialogData {
  event: LearningEvent
  prediction: string
  outcome: string
  targetName: string
  reason: string
}

@Component({
  standalone: true,
  imports: [TranslateModule, ZardButtonComponent],
  templateUrl: './learning-proposal-dialog.component.html'
})
export class LearningProposalDialog {
  readonly data = inject<ProposalDialogData>(Z_MODAL_DATA)
  readonly ref = inject<ZardDialogRef<LearningProposalDialog, ImprovementProposal>>(ZardDialogRef)
  private readonly api = inject(AgentEvolutionApiService)
  private readonly translate = inject(TranslateService)
  private readonly destroy = inject(DestroyRef)
  readonly check = signal<LearningProposalCheck | null>(null)
  readonly working = signal(false)
  readonly error = signal('')
  readonly changed = signal(false)
  readonly prefix = 'XP.AgentEvolution.Learning.'
  constructor() {
    this.refresh()
  }
  refresh() {
    if (this.working()) return
    this.check.set(null)
    this.error.set('')
    this.working.set(true)
    this.api
      .checkLearningProposal(this.data.event.eventId)
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (check) => {
          this.check.set(check)
          this.working.set(false)
        },
        error: () => {
          this.working.set(false)
          this.error.set('CheckFailed')
        }
      })
  }
  confirm() {
    const snapshot = this.check()?.snapshot
    if (!snapshot || this.working()) return
    this.working.set(true)
    this.error.set('')
    this.api
      .confirmLearningProposal(this.data.event.eventId, {
        snapshot,
        title: this.translate.instant(this.prefix + 'ProposalTitle', { name: this.data.targetName }),
        problemStatement: this.translate.instant(this.prefix + 'Observed', {
          prediction: this.data.prediction.slice(0, 500),
          outcome: this.data.outcome.slice(0, 500)
        }),
        changeHypothesis: this.translate.instant(this.prefix + 'Hypothesis', {
          name: this.data.targetName,
          reason: this.data.reason.slice(0, 500)
        })
      })
      .pipe(takeUntilDestroyed(this.destroy))
      .subscribe({
        next: (proposal) => this.ref.close(proposal),
        error: (error: unknown) => {
          this.working.set(false)
          if (error instanceof HttpErrorResponse && error.status === 409) {
            this.changed.set(true)
            this.refresh()
          } else {
            this.error.set('CreateFailed')
          }
        }
      })
  }
}
