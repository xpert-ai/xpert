import { FormsModule } from '@angular/forms'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core'
import { RouterLink } from '@angular/router'
import { TranslateService, TranslateModule } from '@ngx-translate/core'
import {
  resolveI18nText,
  type I18nText,
  type EvolutionChange,
  type EvolutionLifecycleRecord
} from '@xpert-ai/contracts'
import { ZardBadgeComponent, ZardButtonComponent } from '@xpert-ai/headless-ui'
import { AgentEvolutionFacade } from '../agent-evolution.facade'
import { changeTitle, changeWorkbenchLink } from '../shared/evolution-change-presentation'

@Component({
  selector: 'xp-evolution-change-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, CommonModule, RouterLink, TranslateModule, ZardBadgeComponent, ZardButtonComponent],
  templateUrl: './change-panel.component.html'
})
export class EvolutionChangePanelComponent {
  readonly change = input.required<EvolutionChange>()
  readonly lifecycle = input<EvolutionLifecycleRecord | null>(null)
  readonly reason = signal('')
  readonly mode = input<'evaluation' | 'release'>('evaluation')
  private readonly facade = inject(AgentEvolutionFacade)
  private readonly translate = inject(TranslateService)
  text(value: I18nText | undefined) {
    return resolveI18nText(value, this.translate.currentLang) ?? ''
  }
  readonly title = computed(() => changeTitle(this.change(), this.facade.visibleTargets()))
  readonly link = computed(() => changeWorkbenchLink(this.change(), this.mode()))
  readonly passed = computed(() => this.change().evaluation?.checks.filter((item) => item.passed).length ?? 0)
  readonly steps = computed(() => this.lifecycle()?.stages ?? this.change().stages)
  readonly canReview = computed(() => !this.link() && this.change().status === 'pending_approval')
  readonly canPublish = computed(() => !this.link() && this.change().status === 'approved')
  constructor() {
    let selectedId: string | undefined
    effect(() => {
      const id = this.change().changeId
      if (id !== selectedId) {
        selectedId = id
        this.reason.set('')
      }
    })
  }
  review(decision: 'approved' | 'rejected') {
    const change = this.change()
    if (!change.evaluation || !this.reason().trim()) return
    return decision === 'approved'
      ? this.facade.approveCandidate(change.changeId, change.evaluation.runId, this.reason())
      : this.facade.rejectCandidate(change.changeId, change.evaluation.runId, this.reason())
  }
  publish() {
    return this.facade.packageRelease(this.change().changeId, this.change().evaluation!.runId, [])
  }
}
