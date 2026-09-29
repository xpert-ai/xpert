import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core'
import { takeUntilDestroyed } from '@angular/core/rxjs-interop'
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms'
import { RouterLink } from '@angular/router'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import {
  ZardButtonComponent,
  ZardInputDirective,
  ZardSelectImports,
  ZardSelectValue,
  ZardSwitchComponent
} from '@xpert-ai/headless-ui'
import type { NodeOf, TCopilotModel } from '@xpert-ai/contracts'
import { isEqual } from 'lodash-es'
import { getErrorMessage, letterStartSUID } from '@cloud/app/@core'
import { XpertSettingsEditor } from './xpert-settings.editor'
import { SettingsModelSelectComponent } from './settings-model-select.component'
import { delegationAgents, eligibleParents, updateSubAgent } from './settings-delegation.utils'

@Component({
  selector: 'xp-settings-subagents',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    TranslateModule,
    ZardButtonComponent,
    ZardInputDirective,
    ...ZardSelectImports,
    ZardSwitchComponent,
    SettingsModelSelectComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './settings-subagents.component.html'
})
export class SettingsSubagentsComponent {
  readonly editor = inject(XpertSettingsEditor)
  private readonly translate = inject(TranslateService)
  readonly selectedKey = signal<string | null>(null)
  readonly error = signal<string | null>(null)
  readonly revision = signal(0)
  readonly agents = computed(() =>
    delegationAgents(this.editor.source.draft()).filter(
      (node) => node.key !== this.editor.source.draft().team.agent?.key
    )
  )
  readonly parents = computed(() => eligibleParents(this.editor.source.draft(), this.selectedKey() ?? undefined))
  readonly form = new FormGroup({
    title: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(100), Validators.pattern(/\S/)]
    }),
    description: new FormControl('', { nonNullable: true }),
    prompt: new FormControl('', { nonNullable: true }),
    parentKey: new FormControl('', { nonNullable: true, validators: Validators.required }),
    disableMessageHistory: new FormControl(false, { nonNullable: true }),
    required: new FormControl(true, { nonNullable: true }),
    copilotModel: new FormControl<TCopilotModel | null>(null)
  })
  private initial = this.form.getRawValue()
  readonly dirty = computed(() => {
    this.revision()
    return !!this.selectedKey() && !isEqual(this.initial, this.form.getRawValue())
  })
  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.revision.update((value) => value + 1))
  }
  parentTitle(agent: NodeOf<'agent'>) {
    const draft = this.editor.source.draft()
    const key =
      draft.connections.find((edge) => edge.type === 'agent' && edge.to === agent.key)?.from ?? agent.entity.leaderKey
    const parent = delegationAgents(draft).find((node) => node.key === key)
    return (
      parent?.entity.title ||
      parent?.entity.name ||
      key ||
      this.translate.instant('XP.XpertSettings.Delegation.NotConnected')
    )
  }
  edit(agent?: NodeOf<'agent'>) {
    if (this.dirty()) return
    this.selectedKey.set(agent?.key ?? letterStartSUID('Agent_'))
    this.form.reset({
      title: agent?.entity.title || agent?.entity.name || '',
      description: agent?.entity.description ?? '',
      prompt: agent?.entity.prompt ?? '',
      parentKey:
        this.editor.source.draft().connections.find((edge) => edge.type === 'agent' && edge.to === agent?.key)?.from ??
        agent?.entity.leaderKey ??
        this.editor.source.draft().team.agent?.key ??
        '',
      disableMessageHistory: agent?.entity.options?.disableMessageHistory ?? false,
      required: agent
        ? !!this.editor.source.draft().connections.find((edge) => edge.type === 'agent' && edge.to === agent.key)
            ?.required
        : true,
      copilotModel: agent?.entity.copilotModel ?? null
    })
    this.initial = this.form.getRawValue()
    this.revision.update((value) => value + 1)
    this.error.set(null)
  }
  selectParent(value: ZardSelectValue | ZardSelectValue[]) {
    if (typeof value === 'string') this.form.controls.parentKey.setValue(value)
  }
  reset() {
    this.form.reset(this.initial)
    this.revision.update((value) => value + 1)
    this.error.set(null)
  }
  async save() {
    if (!this.dirty()) return this.editor.save()
    this.form.markAllAsTouched()
    const key = this.selectedKey()
    if (!key || this.form.invalid) return false
    try {
      this.editor.source.update((draft) => updateSubAgent(draft, key, this.form.getRawValue()))
      this.initial = this.form.getRawValue()
      this.revision.update((value) => value + 1)
      this.form.markAsPristine()
      this.error.set(null)
      return await this.editor.save()
    } catch (error) {
      this.error.set(this.translate.instant(getErrorMessage(error)))
      return false
    }
  }
}
