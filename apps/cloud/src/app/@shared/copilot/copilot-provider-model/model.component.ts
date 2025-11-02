import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkListboxModule } from '@angular/cdk/listbox'
import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
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
import { MatInputModule } from '@angular/material/input'
import { MatTooltipModule } from '@angular/material/tooltip'
import { KebabToCamelCasePipe } from '@metad/core'
import { myRxResource, NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { AiModelTypeEnum, getErrorMessage, ICopilotProvider, injectCopilotProviderService, ToastrService } from '../../../@core'
import { CopilotCredentialFormComponent } from '../credential-form/form.component'

@Component({
  standalone: true,
  selector: 'copilot-provider-model',
  templateUrl: './model.component.html',
  styleUrls: ['./model.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    DragDropModule,
    CdkListboxModule,
    MatTooltipModule,
    MatInputModule,
    NgmI18nPipe,
    KebabToCamelCasePipe,
    NgmSpinComponent,

    CopilotCredentialFormComponent
  ],
})
export class CopilotProviderModelComponent {
  readonly #dialogRef = inject(DialogRef)
  readonly #data = inject<{ provider: ICopilotProvider; modelId: string }>(DIALOG_DATA)
  readonly #translate = inject(TranslateService)
  readonly #toastr = inject(ToastrService)
  readonly #copilotProviderService = injectCopilotProviderService()
  readonly #cdr = inject(ChangeDetectorRef)

  // Inputs
  readonly copilotProvider = signal(this.#data.provider)
  readonly modelId = signal(this.#data.modelId)

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
    loader: ({request}) => {
      return request.modelId ? this.#copilotProviderService.getModel(request.copilotProviderId, request.modelId) : null
    },
  })

  readonly model = this.#model.value

  readonly model_credential_schema = computed(() => this.copilotProvider().provider?.model_credential_schema)
  readonly supported_model_types = computed(() => this.copilotProvider().provider?.supported_model_types)
  readonly credential_form_schemas = computed(() => {
    return this.model_credential_schema()?.credential_form_schemas
  })

  readonly modelSchema = computed(() => this.model_credential_schema()?.model)

  readonly label = computed(() => this.copilotProvider()?.provider?.label)
  readonly icon = computed(() => this.copilotProvider()?.provider?.icon_large || this.copilotProvider()?.provider?.icon_small)
  readonly help = computed(() => this.copilotProvider()?.provider?.help)
  readonly backgroundColor = computed(() => this.copilotProvider()?.provider?.background)

  readonly #loading = signal(false)
  readonly loading = computed(() => this.#loading() || this.#model.status() === 'loading')
  readonly error = signal('')

  // models
  readonly credentials = model<Record<string, any> | null>(null)
  readonly modelTypes = model<AiModelTypeEnum[]>([])
  readonly modelName = model<string>()

  get invalid() {
    return this.credentialForm().invalid || !this.modelTypes()?.[0] || !this.modelName()
  }


  constructor() {
    effect(() => {
      const value = this.model()
      if (value) {
        this.modelName.set(value.modelName)
        this.modelTypes.set([value.modelType])
        this.credentials.set(value.modelProperties)

        // todo 未解决 cdkList 未及时响应 modelTypes 的值更新
        this.#cdr.markForCheck()
        setTimeout(() => {
          this.#cdr.detectChanges()
        }, 1000);
      } else if (this.modelTypes().length === 0 && this.supported_model_types()) {
        this.modelTypes.set([this.supported_model_types()[0]])
      }
    }, { allowSignalWrites: true })
  }

  delete() {
    this.#loading.set(true)
    this.#copilotProviderService.deleteModel(this.copilotProvider().id, this.modelId()).subscribe({
      next: (deleteResult) => {
        this.#loading.set(false)
        this.#toastr.success('PAC.Messages.DeletedSuccessfully', { Default: 'Deleted successfully' })
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
    this.#copilotProviderService.createModel(this.copilotProvider().id, {
      providerName: this.copilotProvider().providerName,
      modelType: this.modelTypes()[0],
      modelName: this.modelName(),
      modelProperties: this.credentials()
    }).subscribe({
      next: (providerModel) => {
        this.#loading.set(false)
        this.#toastr.success('PAC.Messages.CreatedSuccessfully', { Default: 'Created successfully' })
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
    this.#copilotProviderService.updateModel(this.copilotProvider().id, this.modelId(), {
      modelType: this.modelTypes()[0],
      modelName: this.modelName(),
      modelProperties: this.credentials()
    }).subscribe({
      next: (providerModel) => {
        this.#loading.set(false)
        this.#toastr.success('PAC.Messages.UpdatedSuccessfully', { Default: 'Updated successfully' })
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
