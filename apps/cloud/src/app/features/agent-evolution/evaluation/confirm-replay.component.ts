import { Component, inject } from '@angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { XpDialogActionGroupDirective, ZardButtonComponent, ZardDialogRef, Z_MODAL_DATA } from '@xpert-ai/headless-ui'
import type { DatasetSnapshot, EvolutionCandidate } from '@xpert-ai/contracts'
import { compactId } from './replay-presentation'

export interface ReplayConfirmation {
  title: string
  target: string
  candidate: EvolutionCandidate
  dataset: DatasetSnapshot
}
@Component({
  standalone: true,
  imports: [TranslateModule, XpDialogActionGroupDirective, ZardButtonComponent],
  template: ` <dl
      class="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-5 gap-y-3 [&_dt]:text-sm [&_dt]:text-text-secondary"
    >
      <dt>{{ 'XP.AgentEvolution.Candidate' | translate }}</dt>
      <dd>
        {{ data.title }}
        <code class="text-sm" [title]="data.candidate.candidateId">{{ short(data.candidate.candidateId) }}</code>
      </dd>
      <dt>{{ 'XP.AgentEvolution.Directory.Scope' | translate }}</dt>
      <dd>{{ data.target }} · {{ 'XP.AgentEvolution.ScopeType.' + data.candidate.targetScope.type | translate }}</dd>
      <dt>{{ prefix + 'ThisSnapshot' | translate }}</dt>
      <dd>
        {{ data.dataset.name }}<br /><code [title]="data.dataset.snapshotId">{{ short(data.dataset.snapshotId) }}</code>
        · {{ prefix + 'Cases' | translate: { n: data.dataset.cases.length } }}
      </dd>
    </dl>
    <div xpDialogActionGroup="footer" class="mt-5 flex justify-end gap-2 border-t border-border pt-3">
      <button z-button zType="outline" (click)="ref.close(false)">{{ 'XP.ACTIONS.Cancel' | translate }}</button
      ><button z-button (click)="ref.close(true)">{{ prefix + 'Start' | translate }}</button>
    </div>`
})
export class ConfirmReplayComponent {
  readonly data = inject<ReplayConfirmation>(Z_MODAL_DATA)
  readonly ref = inject<ZardDialogRef<ConfirmReplayComponent, boolean>>(ZardDialogRef)
  readonly prefix = 'XP.AgentEvolution.ReplayWorkbench.'
  readonly short = compactId
}
