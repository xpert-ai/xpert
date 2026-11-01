import { Dialog } from '@angular/cdk/dialog'
import { Component, computed, effect, inject, input, output, signal, viewChild } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms'
import { DefaultModelRole, defaultModelDefinition, ICopilot, ICopilotModel } from '@xpert-ai/contracts'
import { XpSpinComponent } from '@xpert-ai/headless-ui'
import { TranslateModule } from '@ngx-translate/core'
import { auditTime, distinctUntilChanged, firstValueFrom, startWith } from 'rxjs'
import { CopilotAiProvidersComponent } from '../ai-providers/providers.component'
import { CopilotModelSelectComponent } from '../copilot-model-select/select.component'
import { CopilotProviderComponent } from '../copilot-provider/provider.component'
import { getErrorMessage, ICopilotProviderModel, injectCopilotServer, ToastrService } from '../../../@core'

@Component({
  standalone: true,
  selector: 'xp-copilot-config-form',
  templateUrl: './form.component.html',
  host: {
    class: 'block overflow-hidden'
  },
  imports: [
    TranslateModule,
    ReactiveFormsModule,
    XpSpinComponent,
    CopilotProviderComponent,
    CopilotModelSelectComponent
  ]
})
export class CopilotConfigFormComponent {
  readonly #copilotServer = injectCopilotServer()
  readonly #toastrService = inject(ToastrService)
  readonly #dialog = inject(Dialog)

  readonly copilot = input<ICopilot>()
  readonly defaultRole = input<DefaultModelRole>(DefaultModelRole.Primary)
  readonly saved = output<void>()
  readonly modelSelector = viewChild(CopilotModelSelectComponent)

  readonly formGroup = new FormGroup({
    id: new FormControl(null),
    tokenBalance: new FormControl(null),
    copilotModel: new FormControl<ICopilotModel | null>(null)
  })
  readonly tokenBalanceControl = this.formGroup.controls.tokenBalance

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

  readonly defaultModelType = computed(() => defaultModelDefinition(this.defaultRole()).modelType)

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
    const selector = this.modelSelector()
    const selectionReady =
      !this.hasSelectedModel() ||
      (!!selector && selector.modelCatalog.status() === 'success' && !selector.selectionUnavailable())
    return !this.saving() && selectionReady && this.formGroup.valid && !this.formGroup.pristine
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
          tokenBalance: this.tokenBalanceControl.value
        })
      )
      const model = this.formGroup.controls.copilotModel.value
      await firstValueFrom(
        this.#copilotServer.saveRoleDefaults(
          model?.copilotId && model.model
            ? [
                {
                  role: this.defaultRole(),
                  mode: 'fixed',
                  binding: {
                    copilotId: model.copilotId,
                    model: model.model,
                    modelType: this.defaultModelType(),
                    options: model.options
                  }
                }
              ]
            : [{ role: this.defaultRole(), mode: 'disabled' }]
        )
      )
      this.formGroup.markAsPristine()
      this.#toastrService.success('XP.ACTIONS.Save', { Default: 'Save' })
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
      backdropClass: 'backdrop-blur-xs-black',
      panelClass: 'xp-overlay-pane-dialog',
      maxWidth: 'calc(100vw - 32px)',
      data: {
        copilot: this.formGroup.value
      }
    })

    dialogRef.closed.subscribe((copilotProvider) => {
      this.#copilotServer.refresh()
      if (copilotProvider) {
        this.saved.emit()
      }
    })
  }

  removedModelProvider() {
    this.#copilotServer.refresh()
    this.saved.emit()
  }

  onAddedModel(model: ICopilotProviderModel) {
    this.#copilotServer.refresh()
  }

  onModelsImported() {
    this.#copilotServer.refresh()
  }
}
