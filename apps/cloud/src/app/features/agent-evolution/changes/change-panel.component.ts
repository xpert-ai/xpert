import { FormsModule } from '@angular/forms'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core'
import { RouterLink } from '@angular/router'
import { toSignal } from '@angular/core/rxjs-interop'
import { Store } from '@cloud/app/@core/state'
import { map } from 'rxjs'
import { TranslateService, TranslateModule } from '@ngx-translate/core'
import {
  AIPermissionsEnum,
  resolveI18nText,
  type I18nText,
  type EvolutionChange,
  type EvolutionLifecycleRecord
} from '@xpert-ai/contracts'
import { ZardButtonComponent, ZardInputDirective } from '@xpert-ai/headless-ui'
import { AgentEvolutionFacade } from '../agent-evolution.facade'
import { changeTitle, changeWorkbenchLink } from '../shared/evolution-change-presentation'
import { changeDetailPresentation } from './change-detail-presentation'

@Component({
  selector: 'xp-evolution-change-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, CommonModule, RouterLink, TranslateModule, ZardButtonComponent, ZardInputDirective],
  templateUrl: './change-panel.component.html'
})
export class EvolutionChangePanelComponent {
  readonly change = input.required<EvolutionChange>()
  readonly lifecycle = input<EvolutionLifecycleRecord | null>(null)
  readonly reason = signal('')
  readonly mode = input<'evaluation' | 'release'>('evaluation')
  private readonly facade = inject(AgentEvolutionFacade)
  readonly busy = this.facade.mutating
  private readonly store = inject(Store)
  readonly canManage = toSignal(
    this.store.userRolePermissions$.pipe(map(() => this.store.hasPermission(AIPermissionsEnum.EVOLUTION_MANAGE))),
    { initialValue: this.store.hasPermission(AIPermissionsEnum.EVOLUTION_MANAGE) }
  )
  private readonly translate = inject(TranslateService)
  text(value: I18nText | undefined) {
    return resolveI18nText(value, this.translate.currentLang) ?? ''
  }
  readonly detail = computed(() => changeDetailPresentation(this.change(), this.lifecycle()))
  stagedStatus() {
    const status = this.detail().stagedStatus
    return status ? this.translate.instant(`XP.AgentEvolution.Status.${status}`, { Default: status }) : ''
  }
  adoptionSubject() {
    return (
      this.text(this.detail().business?.adoption?.subjectLabel) ||
      this.translate.instant('XP.AgentEvolution.ChangeDetail.AdoptionSubject')
    )
  }
  title() {
    return (
      this.text(this.detail().business?.title) ||
      this.translate.instant('XP.AgentEvolution.ChangeDetail.NeutralTitle', {
        subject: changeTitle(this.change(), this.facade.visibleTargets())
      })
    )
  }
  readonly link = computed(() => changeWorkbenchLink(this.change(), this.detail().published ? 'release' : 'evaluation'))
  readonly metrics = computed(() =>
    (this.change().presentation?.metrics ?? []).filter(
      (metric) => !this.detail().business?.adoption || metric.kind !== 'adoption'
    )
  )
  readonly passed = computed(() => this.change().evaluation?.checks.filter((item) => item.passed).length ?? 0)
  readonly steps = computed(() => this.detail().steps)
  readonly canReview = computed(
    () => this.canManage() && this.change().evaluation?.passed === true && this.change().status === 'pending_approval'
  )
  readonly combinedPublication = computed(() => this.change().strategy.definition.publication.mode === 'version_write')
  readonly canPublish = computed(
    () =>
      this.canManage() &&
      this.change().evaluation?.passed === true &&
      (this.change().status === 'approved' || (this.combinedPublication() && this.change().status === 'publishing'))
  )
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
    if (this.busy() || !this.canReview() || !change.evaluation || !this.reason().trim()) return
    if (decision === 'approved' && this.combinedPublication())
      return this.facade.approveAndPublishChange(change, this.reason())
    return decision === 'approved'
      ? this.facade.approveCandidate(change.changeId, change.evaluation.runId, this.reason())
      : this.facade.rejectCandidate(change.changeId, change.evaluation.runId, this.reason())
  }
  publish() {
    if (this.busy() || !this.canPublish()) return
    if (this.combinedPublication()) return this.facade.publishApprovedChange(this.change())
    return this.facade.packageRelease(this.change().changeId, this.change().evaluation!.runId, [])
  }
}
