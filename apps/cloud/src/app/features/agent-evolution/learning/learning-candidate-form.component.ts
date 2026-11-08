import { Component, computed, effect, inject, input, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { firstValueFrom } from 'rxjs'
import type {
  ImprovementProposal,
  EvolutionTargetDescriptor,
  EvolutionCandidateChangeFieldDescriptor
} from '@xpert-ai/contracts'
import {
  ZardAlertDialogService,
  XpI18nPipe,
  ZardButtonComponent,
  ZardCheckboxComponent,
  ZardInputDirective,
  ZardSelectImports,
  type ZardSelectValue
} from '@xpert-ai/headless-ui'
import { AgentEvolutionFacade } from '../agent-evolution.facade'
@Component({
  selector: 'xp-learning-candidate-form',
  standalone: true,
  imports: [
    FormsModule,
    TranslateModule,
    XpI18nPipe,
    ZardButtonComponent,
    ZardCheckboxComponent,
    ZardInputDirective,
    ...ZardSelectImports
  ],
  templateUrl: './learning-candidate-form.component.html'
})
export class LearningCandidateFormComponent {
  readonly facade = inject(AgentEvolutionFacade)
  readonly #alertDialog = inject(ZardAlertDialogService)
  readonly #translate = inject(TranslateService)
  readonly selectedProposal = input.required<ImprovementProposal>()
  readonly candidateTarget = input<EvolutionTargetDescriptor>()
  readonly candidateDraft = signal<Record<string, string | number | boolean | string[]>>({})
  readonly candidateFields = computed(() => this.candidateTarget()?.candidateForm?.fields ?? [])
  readonly canBuildCandidate = computed(
    () =>
      this.selectedProposal()?.status === 'ready' &&
      this.candidateTarget()?.capabilities.candidateBuild === true &&
      !!this.candidateTarget()?.candidateForm
  )
  readonly candidateDraftValid = computed(() =>
    this.candidateFields().every((field) => !field.required || hasFieldValue(this.candidateDraft()[field.key]))
  )

  readonly #candidateDraftEffect = effect(() => {
    const fields = this.candidateFields()
    this.candidateDraft.set(
      Object.fromEntries(fields.map((field) => [field.key, cloneDefaultValue(field.defaultValue)])) as Record<
        string,
        string | number | boolean | string[]
      >
    )
  })

  candidateValue(field: EvolutionCandidateChangeFieldDescriptor) {
    return this.candidateDraft()[field.key] ?? cloneDefaultValue(field.defaultValue)
  }

  candidateSelectValue(field: EvolutionCandidateChangeFieldDescriptor): string | number {
    const value = this.candidateValue(field)
    return typeof value === 'string' || typeof value === 'number' ? value : ''
  }

  setCandidateValue(field: EvolutionCandidateChangeFieldDescriptor, value: string | number | boolean) {
    const normalized = field.type === 'number' ? Number(value) : field.type === 'boolean' ? Boolean(value) : `${value}`
    this.candidateDraft.update((current) => ({ ...current, [field.key]: normalized }))
  }

  setCandidateSelectValue(field: EvolutionCandidateChangeFieldDescriptor, value: ZardSelectValue | ZardSelectValue[]) {
    const selected = Array.isArray(value) ? value[0] : value
    if (selected !== undefined) this.setCandidateValue(field, selected)
  }

  setCandidateArrayValue(field: EvolutionCandidateChangeFieldDescriptor, value: string) {
    this.candidateDraft.update((current) => ({
      ...current,
      [field.key]: value
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean)
    }))
  }

  candidateArrayText(field: EvolutionCandidateChangeFieldDescriptor) {
    const value = this.candidateValue(field)
    return Array.isArray(value) ? value.join('\n') : ''
  }

  async buildCandidate() {
    const proposal = this.selectedProposal()
    if (!proposal || !this.canBuildCandidate() || !this.candidateDraftValid()) return
    const confirmed = await firstValueFrom(
      this.#alertDialog.confirm({
        layout: 'standard',
        title: this.#translate.instant('XP.AgentEvolution.BuildIsolatedCandidateTitle'),
        description: this.#translate.instant('XP.AgentEvolution.BuildIsolatedCandidateDescription'),
        actionText: this.#translate.instant('XP.AgentEvolution.BuildCandidate'),
        cancelText: this.#translate.instant('XP.ACTIONS.Cancel', { Default: 'Cancel' })
      })
    )
    if (confirmed) await this.facade.buildCandidate(proposal, this.candidateDraft())
  }
}

function cloneDefaultValue(value: EvolutionCandidateChangeFieldDescriptor['defaultValue']) {
  return Array.isArray(value) ? [...value] : (value ?? '')
}

function hasFieldValue(value: string | number | boolean | string[] | undefined) {
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'string') return value.trim().length > 0
  return value !== undefined && value !== null && !Number.isNaN(value)
}
