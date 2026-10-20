import {
  XpDialogFrameImports,
  ZardButtonComponent,
  ZardInputDirective,
  XpSpinComponent,
  XpI18nPipe
} from '@xpert-ai/headless-ui'
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { ChangeDetectionStrategy, Component, computed, DestroyRef, effect, inject, model, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import { derivedAsync } from 'ngxtension/derived-async'
import { isEqual } from 'lodash-es'
import { firstValueFrom } from 'rxjs'
import {
  AiModelTypeEnum,
  ProviderCredentialCheckInput,
  ProviderCredentialValidationCapabilities,
  ProviderCredentialValidationResult,
  ProviderCredentialValidationTarget
} from '@xpert-ai/contracts'
import { CopilotProviderService, getErrorMessage, IAiProviderEntity, ICopilot, ToastrService } from '../../../@core'
import { CopilotCredentialFormComponent } from '../credential-form/form.component'

@Component({
  standalone: true,
  selector: 'copilot-ai-provider-auth-dialog',
  templateUrl: './authorization.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ...XpDialogFrameImports,
    ZardButtonComponent,
    ZardInputDirective,
    FormsModule,
    TranslateModule,
    DragDropModule,
    XpI18nPipe,
    XpSpinComponent,
    CopilotCredentialFormComponent
  ]
})
export class CopilotAiProviderAuthComponent {
  readonly #dialogRef = inject(DialogRef)
  readonly #data = inject<{ provider: IAiProviderEntity; copilot: ICopilot; providerId?: string }>(DIALOG_DATA)
  readonly #service = inject(CopilotProviderService)
  readonly #toastr = inject(ToastrService)
  readonly #destroyRef = inject(DestroyRef)

  readonly providerId = computed(() => this.#data.providerId)
  readonly provider = computed(() => this.#data.provider)
  readonly copilot = computed(() => this.#data.copilot)
  readonly credential_form_schemas = computed(
    () => this.provider()?.provider_credential_schema?.credential_form_schemas
  )
  readonly copilotProvider = derivedAsync(() =>
    this.providerId() ? this.#service.getOneById(this.providerId()) : null
  )
  readonly credentials = model<Record<string, unknown>>({})
  readonly help = computed(() => this.provider()?.help)
  readonly loading = signal(false)
  readonly testing = signal(false)
  readonly loadingCapabilities = signal(true)
  readonly error = signal('')
  readonly capabilities = signal<ProviderCredentialValidationCapabilities | null>(null)
  readonly modelType = signal<AiModelTypeEnum | null>(null)
  readonly testModel = signal('')
  readonly dirty = computed(() => !isEqual(this.copilotProvider()?.credentials, this.credentials()))
  readonly modelCapabilities = computed(() => {
    const capabilities = this.capabilities()
    return capabilities?.method === 'model' ? capabilities : null
  })
  readonly suggestedModels = computed(
    () => this.modelCapabilities()?.models.filter((entry) => entry.modelType === this.modelType()) ?? []
  )
  readonly validationTarget = computed<ProviderCredentialValidationTarget | undefined>(() => {
    const modelType = this.modelType()
    const model = this.testModel().trim()
    return this.modelCapabilities()?.modelTypes.includes(modelType) && model ? { modelType, model } : undefined
  })
  private readonly checked = signal<{
    input: ProviderCredentialCheckInput
    result: ProviderCredentialValidationResult
  } | null>(null)
  readonly validationResult = computed(() => {
    const checked = this.checked()
    return checked && isEqual(checked.input, this.checkInput()) ? checked.result : null
  })
  readonly discoveredModels = computed(() => {
    const result = this.validationResult()
    return result?.method === 'discovery' ? result.models : null
  })
  readonly canTest = computed(
    () =>
      !!this.capabilities() &&
      !this.loadingCapabilities() &&
      !this.loading() &&
      !this.testing() &&
      (this.capabilities().method !== 'model' || !!this.validationTarget())
  )

  constructor() {
    effect(() => {
      if (this.copilotProvider()) this.credentials.set(this.copilotProvider().credentials)
    })
    void this.loadCapabilities()
  }

  async loadCapabilities() {
    this.loadingCapabilities.set(true)
    this.error.set('')
    try {
      const capabilities = await firstValueFrom(
        this.#service.credentialValidationCapabilities(this.provider().provider)
      )
      if (this.#destroyRef.destroyed) return
      this.capabilities.set(capabilities)
      if (capabilities.method === 'model') this.modelType.set(capabilities.modelTypes[0] ?? null)
    } catch (error) {
      if (!this.#destroyRef.destroyed) this.error.set(getErrorMessage(error))
    } finally {
      if (!this.#destroyRef.destroyed) this.loadingCapabilities.set(false)
    }
  }

  changeModelType(value: string) {
    const type = this.modelCapabilities()?.modelTypes.find((type) => type === value)
    if (type) {
      this.modelType.set(type)
      this.testModel.set('')
      this.checked.set(null)
    }
  }

  private checkInput(): ProviderCredentialCheckInput {
    return { credentials: { ...this.credentials() }, validationTarget: this.validationTarget() }
  }

  async testCredentials() {
    if (!this.canTest()) return
    const input = this.checkInput()
    this.testing.set(true)
    this.error.set('')
    this.checked.set(null)
    try {
      const result = await firstValueFrom(this.#service.checkCredentials(this.provider().provider, input))
      if (!this.#destroyRef.destroyed && isEqual(input, this.checkInput())) this.checked.set({ input, result })
    } catch (error) {
      if (!this.#destroyRef.destroyed && isEqual(input, this.checkInput())) this.error.set(getErrorMessage(error))
    } finally {
      if (!this.#destroyRef.destroyed) this.testing.set(false)
    }
  }

  cancel() {
    this.#dialogRef.close()
  }

  async apply() {
    if (!this.validationResult() || this.loading() || this.testing()) return
    const input = this.checkInput()
    this.loading.set(true)
    this.error.set('')
    try {
      const provider = await firstValueFrom(
        this.#service.saveCredentials(this.providerId(), {
          ...input,
          copilotId: this.copilot().id,
          providerName: this.provider().provider
        })
      )
      if (this.#destroyRef.destroyed) return
      this.#toastr.success(this.providerId() ? 'XP.Messages.UpdatedSuccessfully' : 'XP.Messages.CreatedSuccessfully')
      this.#dialogRef.close(provider)
    } catch (error) {
      if (this.#destroyRef.destroyed) return
      this.checked.set(null)
      this.error.set(getErrorMessage(error))
      this.#toastr.error(getErrorMessage(error))
    } finally {
      if (!this.#destroyRef.destroyed) this.loading.set(false)
    }
  }
}
