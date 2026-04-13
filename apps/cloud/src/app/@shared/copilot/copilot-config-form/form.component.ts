import { Dialog } from '@angular/cdk/dialog'
import { Component, computed, effect, inject, input, output, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms'
import { AiModelTypeEnum, AiProviderRole, ICopilot } from '@xpert-ai/contracts'
import { NgmSpinComponent } from '@xpert-ai/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { auditTime, distinctUntilChanged, firstValueFrom, startWith } from 'rxjs'
import { CopilotAiProvidersComponent } from '../ai-providers/providers.component'
import { CopilotModelSelectComponent } from '../copilot-model-select/select.component'
import { CopilotProviderComponent } from '../copilot-provider/provider.component'
import { getErrorMessage, ICopilotProviderModel, injectCopilotServer, ToastrService } from '../../../@core'

@Component({
  standalone: true,
  selector: 'pac-copilot-config-form',
  templateUrl: './form.component.html',
  host: {
    class: 'block overflow-hidden'
  },
  imports: [TranslateModule, ReactiveFormsModule, NgmSpinComponent, CopilotProviderComponent, CopilotModelSelectComponent]
})
export class CopilotConfigFormComponent {
  readonly #copilotServer = injectCopilotServer()
  readonly #toastrService = inject(ToastrService)
  readonly #dialog = inject(Dialog)

  readonly copilot = input<ICopilot>()
  readonly saved = output<void>()

  readonly formGroup = new FormGroup({
    id: new FormControl(null),
    tokenBalance: new FormControl(null),
    copilotModel: new FormControl(null)
  })
  readonly tokenBalanceControl = this.formGroup.controls.tokenBalance

  readonly role = computed(() => this.copilot()?.role)
  readonly modelProvider = computed(() => this.copilot()?.modelProvider)
  readonly saving = signal(false)
  readonly tokenBalance = toSignal(
    this.tokenBalanceControl.valueChanges.pipe(
      startWith(this.tokenBalanceControl.value),
      auditTime(16),
      distinctUntilChanged()
    ),
    { initialValue: this.tokenBalanceControl.value }
  )

  readonly defaultModelType = computed(() => {
    switch (this.role()) {
      case AiProviderRole.Primary:
      case AiProviderRole.Secondary:
        return AiModelTypeEnum.LLM
      case AiProviderRole.Embedding:
        return AiModelTypeEnum.TEXT_EMBEDDING
      default:
        return null
    }
  })

  constructor() {
    effect(() => {
      const copilot = this.copilot()
      if (copilot) {
        this.formGroup.patchValue(copilot)
        this.formGroup.markAsPristine()
      }
    })
  }

  canSubmit() {
    return !this.saving() && this.formGroup.valid && !this.formGroup.pristine
  }

  hasSelectedModel() {
    const model = this.formGroup.get('copilotModel').value
    return !!model?.copilotId && !!model?.model
  }

  async submit() {
    const copilotId = this.copilot()?.id
    if (!copilotId || !this.canSubmit()) {
      return false
    }

    try {
      this.saving.set(true)
      await firstValueFrom(
        this.#copilotServer.update(copilotId, {
          ...this.formGroup.value
        })
      )
      this.formGroup.markAsPristine()
      this.#toastrService.success('PAC.ACTIONS.Save', { Default: 'Save' })
      this.#copilotServer.refresh()
      this.saved.emit()
      return true
    } catch (err) {
      this.#toastrService.error(getErrorMessage(err))
      return false
    } finally {
      this.saving.set(false)
    }
  }

  reset() {
    if (this.copilot()) {
      this.formGroup.patchValue(this.copilot())
    } else {
      this.formGroup.reset()
    }
    this.formGroup.markAsPristine()
  }

  openAiProviders() {
    const dialogRef = this.#dialog.open<string>(CopilotAiProvidersComponent, {
      data: {
        copilot: this.formGroup.value
      }
    })

    dialogRef.closed.subscribe(() => {
      this.#copilotServer.refresh()
    })
  }

  removedModelProvider() {
    this.#copilotServer.refresh()
  }

  onAddedModel(model: ICopilotProviderModel) {
    this.#copilotServer.refresh()
  }
}
