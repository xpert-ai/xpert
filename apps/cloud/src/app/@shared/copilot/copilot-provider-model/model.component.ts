import { XpDialogFrameImports, ZardButtonComponent } from '@xpert-ai/headless-ui'
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  model,
  output,
  signal,
  viewChild
} from '@angular/core'
import { FormsModule, ReactiveFormsModule } from '@angular/forms'
import { ZardInputDirective, ZardTooltipImports } from '@xpert-ai/headless-ui'
import { ZardRadioComponent, ZardRadioGroupComponent } from '@xpert-ai/headless-ui'
import { myRxResource, XpI18nPipe } from '@xpert-ai/headless-ui'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { XpSpinComponent } from '@xpert-ai/headless-ui'
import {
  AiModelTypeEnum,
  getErrorMessage,
  ICopilotProvider,
  injectCopilotProviderService,
  ToastrService
} from '../../../@core'
import { CopilotCredentialFormComponent } from '../credential-form/form.component'
import {
  configurationFromModel,
  defaultModelConfiguration,
  isDiscoverableModelType,
  ProviderModelCatalog,
  ModelConfiguration,
  modelConfigurationSchema,
  readModelConfiguration
} from '@xpert-ai/contracts'
import { ModelConfigurationComponent } from '../model-configuration/configuration.component'

@Component({
  standalone: true,
  selector: 'copilot-provider-model',
  templateUrl: './model.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ...XpDialogFrameImports,
    ZardButtonComponent,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    DragDropModule,
    ZardRadioComponent,
    ZardRadioGroupComponent,
    ...ZardTooltipImports,
    ZardInputDirective,
    XpI18nPipe,
    XpSpinComponent,
    CopilotCredentialFormComponent,
    ModelConfigurationComponent
  ]
})
export class CopilotProviderModelComponent {
  readonly #dialogRef = inject(DialogRef)
  readonly #data = inject<{
    provider: ICopilotProvider
    modelId: string
    allowDelete?: boolean
    catalog?: ProviderModelCatalog
  }>(DIALOG_DATA)
  readonly #translate = inject(TranslateService)
  readonly #toastr = inject(ToastrService)
  readonly #copilotProviderService = injectCopilotProviderService()

  // Inputs
  readonly copilotProvider = signal(this.#data.provider)
  readonly modelId = signal(this.#data.modelId)
  readonly allowDelete = this.#data.allowDelete !== false

  // Outputs
  readonly deleted = output<void>()

  // ViewChild
  readonly credentialForm = viewChild('credentialForm', { read: CopilotCredentialFormComponent })

  // Models
  readonly #model = myRxResource({
    request: () => {
      return {
        modelId: this.modelId(),
        copilotProviderId: this.copilotProvider()?.id
      }
    },
    loader: ({ request }) => {
      return request.modelId ? this.#copilotProviderService.getModel(request.copilotProviderId, request.modelId) : null
    }
  })

  readonly model = this.#model.value

  readonly model_credential_schema = computed(() => this.copilotProvider().provider?.model_credential_schema)
  readonly supported_model_types = computed(() => this.copilotProvider().provider?.supported_model_types)
  readonly credential_form_schemas = computed(() => {
    return this.model_credential_schema()?.credential_form_schemas
  })

  readonly modelSchema = computed(() => this.model_credential_schema()?.model)

  readonly label = computed(() => this.copilotProvider()?.provider?.label)
  readonly icon = computed(
    () => this.copilotProvider()?.provider?.icon_large || this.copilotProvider()?.provider?.icon_small
  )
  readonly help = computed(() => this.copilotProvider()?.provider?.help)
  readonly backgroundColor = computed(() => this.copilotProvider()?.provider?.background)

  readonly #loading = signal(false)
  readonly loading = computed(() => this.#loading() || this.#model.status() === 'loading')
  readonly error = signal('')

  // models
  readonly credentials = model<Record<string, any> | null>(null)
  readonly modelTypes = model<AiModelTypeEnum[]>([])
  readonly modelName = model<string>()
  readonly configuration = signal<ModelConfiguration | null>(null)

  private savedProperties() {
    const properties = { ...this.credentials() }
    // The loaded credentials may still contain the previous model type's configuration.
    delete properties.model_configuration
    const configuration = this.configuration()
    if (configuration?.modelType === this.modelTypes()[0]) properties.model_configuration = configuration
    return properties
  }

  get invalid() {
    return (
      this.credentialForm()?.invalid ||
      !this.modelTypes()?.[0] ||
      !this.modelName() ||
      (this.configuration() && !modelConfigurationSchema.safeParse(this.configuration()).success)
    )
  }

  constructor() {
    effect(() => {
      const value = this.model()
      if (value) {
        this.modelName.set(value.modelName)
        this.modelTypes.set([value.modelType])
        this.credentials.set(value.modelProperties)
        this.configuration.set(readModelConfiguration(value.modelProperties) ?? null)
      } else if (!this.modelId() && this.modelTypes().length === 0 && this.supported_model_types()) {
        this.modelTypes.set([this.supported_model_types()[0]])
      }
    })
    effect(() => {
      const catalog = this.#data.catalog
      if (this.modelId() || !catalog?.discoverySupported) return
      const type = this.modelTypes()[0]
      const name = this.modelName()
      if (!isDiscoverableModelType(type)) return
      const saved = catalog.custom?.find((model) => model.modelName === name && model.modelType === type)
      const builtin = catalog.builtin?.find((model) => model.model === name && model.model_type === type)
      this.configuration.set(readModelConfiguration(saved?.modelProperties) ?? configurationFromModel(type, builtin))
    })
    effect(() => {
      const type = this.modelTypes()[0]
      const configuration = this.configuration()
      if (!isDiscoverableModelType(type)) {
        this.configuration.set(null)
      } else if (
        (configuration && configuration.modelType !== type) ||
        (!configuration && readModelConfiguration(this.model()?.modelProperties))
      ) {
        this.configuration.set(defaultModelConfiguration(type))
      }
    })
  }

  delete() {
    this.#loading.set(true)
    this.#copilotProviderService.deleteModel(this.copilotProvider().id, this.modelId()).subscribe({
      next: (deleteResult) => {
        this.#loading.set(false)
        this.#toastr.success('XP.Messages.DeletedSuccessfully', { Default: 'Deleted successfully' })
        this.#dialogRef.close(deleteResult)
      },
      error: (err) => {
        this.#loading.set(false)
        this.#toastr.error(getErrorMessage(err))
      }
    })
  }

  apply() {
    if (this.modelId()) {
      return this.updateModel()
    }
    this.#loading.set(true)
    this.error.set('')
    this.#copilotProviderService
      .createModel(this.copilotProvider().id, {
        providerName: this.copilotProvider().providerName,
        modelType: this.modelTypes()[0],
        modelName: this.modelName(),
        modelProperties: this.savedProperties()
      })
      .subscribe({
        next: (providerModel) => {
          this.#loading.set(false)
          this.#toastr.success('XP.Messages.CreatedSuccessfully', { Default: 'Created successfully' })
          this.#dialogRef.close(providerModel)
        },
        error: (err) => {
          this.#loading.set(false)
          this.error.set(getErrorMessage(err))
          this.#toastr.error(getErrorMessage(err))
        }
      })
  }

  updateModel() {
    this.#loading.set(true)
    this.error.set('')
    this.#copilotProviderService
      .updateModel(this.copilotProvider().id, this.modelId(), {
        modelType: this.modelTypes()[0],
        modelName: this.modelName(),
        modelProperties: this.savedProperties()
      })
      .subscribe({
        next: (providerModel) => {
          this.#loading.set(false)
          this.#toastr.success('XP.Messages.UpdatedSuccessfully', { Default: 'Updated successfully' })
          this.#dialogRef.close(providerModel)
        },
        error: (err) => {
          this.#loading.set(false)
          this.error.set(getErrorMessage(err))
          this.#toastr.error(getErrorMessage(err))
        }
      })
  }

  close() {
    this.#dialogRef.close()
  }
}
