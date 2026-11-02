import { ZardTableImports, ZardRadioGroupComponent, ZardRadioComponent } from '@xpert-ai/headless-ui'
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { Component, computed, inject, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { ICopilotModel, ModelParameterPolicy, ParameterRule, transitionModelParameters } from '@xpert-ai/contracts'
import { XpDialogFrameImports, ZardButtonComponent } from '@xpert-ai/headless-ui'
import { firstValueFrom } from 'rxjs'
import { ModelParameterInputComponent } from '../model-parameter-input/input.component'
import { CopilotProviderService, getErrorMessage } from '../../../@core'

export interface ModelSwitchData {
  previous: Partial<ICopilotModel> | null
  target: ICopilotModel
  providerId: string
  connectionName?: string
}

@Component({
  standalone: true,
  selector: 'xp-model-switch-dialog',
  imports: [
    ...ZardTableImports,
    ZardRadioGroupComponent,
    ZardRadioComponent,
    FormsModule,
    TranslateModule,
    ...XpDialogFrameImports,
    ZardButtonComponent,
    ModelParameterInputComponent
  ],
  templateUrl: './switch.component.html'
})
export class ModelSwitchDialogComponent {
  readonly data = inject<ModelSwitchData>(DIALOG_DATA)
  readonly dialog = inject(DialogRef<ICopilotModel>)
  readonly service = inject(CopilotProviderService)
  readonly loading = signal(true)
  readonly error = signal('')
  readonly rules = signal<ParameterRule[]>([])
  readonly policy = signal<ModelParameterPolicy>('reset')
  readonly requiredValues = signal<Record<string, unknown>>({})
  readonly basePreview = computed(() =>
    transitionModelParameters(this.data.previous?.options, this.rules(), this.policy())
  )
  readonly requiredRules = computed(() => this.rules().filter((rule) => this.basePreview().missing.includes(rule.name)))
  readonly preview = computed(() => {
    const base = this.basePreview()
    const resolved = transitionModelParameters(
      { ...base.options, ...this.requiredValues() },
      this.rules(),
      'compatible'
    )
    return { ...resolved, changes: base.changes.map((change) => ({ ...change, after: resolved.options[change.name] })) }
  })
  setRequired(name: string, value: unknown) {
    this.requiredValues.update((values) => ({ ...values, [name]: value }))
  }
  constructor() {
    void this.load()
  }
  async load() {
    this.loading.set(true)
    this.error.set('')
    try {
      this.rules.set(
        await firstValueFrom(
          this.service.getModelParameterRules(this.data.providerId, this.data.target.modelType, this.data.target.model)
        )
      )
    } catch (error) {
      this.error.set(getErrorMessage(error))
    } finally {
      this.loading.set(false)
    }
  }
  display(value: unknown) {
    return value === undefined ? '—' : JSON.stringify(value)
  }
  apply() {
    if (this.loading() || this.error() || this.preview().missing.length) return
    this.dialog.close({
      ...this.data.target,
      options: {
        ...this.preview().options,
        ...(this.data.target.options?.context_size ? { context_size: this.data.target.options.context_size } : {})
      }
    })
  }
}
