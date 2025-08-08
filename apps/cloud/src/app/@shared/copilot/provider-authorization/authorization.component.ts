import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog'
import { DragDropModule } from '@angular/cdk/drag-drop'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, inject, model, signal } from '@angular/core'
import { FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { derivedAsync } from 'ngxtension/derived-async'
import { isEqual } from 'lodash-es'
import { Subscription } from 'rxjs'
import { CopilotProviderService, getErrorMessage, IAiProviderEntity, ICopilot, ToastrService } from '../../../@core'
import { CopilotCredentialFormComponent } from '../credential-form/form.component'

@Component({
  standalone: true,
  selector: 'copilot-ai-provider-auth-dialog',
  templateUrl: './authorization.component.html',
  styleUrls: ['./authorization.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    CdkMenuModule,
    DragDropModule,
    NgmI18nPipe,
    NgmSpinComponent,
    CopilotCredentialFormComponent
  ]
})
export class CopilotAiProviderAuthComponent {
  readonly #dialogRef = inject(DialogRef)
  readonly #data = inject<{ provider: IAiProviderEntity; copilot: ICopilot; providerId: string; }>(DIALOG_DATA)
  readonly #copilotProviderService = inject(CopilotProviderService)
  readonly #translate = inject(TranslateService)
  readonly #toastr = inject(ToastrService)
  readonly #fb = inject(FormBuilder)
  readonly #i18n = new NgmI18nPipe()

  readonly providerId = computed(() => this.#data.providerId)
  readonly provider = computed(() => this.#data.provider)
  readonly copilot = computed(() => this.#data.copilot)
  readonly icon = computed(() => this.#i18n.transform(this.provider()?.icon_large))
  readonly provider_credential_schema = computed(() => this.provider()?.provider_credential_schema)
  readonly credential_form_schemas = computed(() => this.provider_credential_schema()?.credential_form_schemas)

  readonly copilotProvider = derivedAsync(() => {
    return this.providerId() ? this.#copilotProviderService.getOneById(this.providerId()) : null
  })

  readonly credentials = model<Record<string, any>>({})

  readonly help = computed(() => this.provider()?.help)

  readonly loading = signal(false)
  readonly error = signal('')
  readonly dirty = computed(() => !isEqual(this.copilotProvider()?.credentials, this.credentials()))

  #subscription: Subscription = null

  constructor() {
    effect(() => {
      if (this.copilotProvider()) {
        this.credentials.set(this.copilotProvider().credentials)
      }
    }, { allowSignalWrites: true })
  }

  cancel() {
    if (!this.#subscription?.closed) {
      this.#subscription?.unsubscribe()
    }
    this.#dialogRef.close()
  }

  apply() {
    if (this.providerId()) {
      return this.update()
    }

    this.loading.set(true)
    this.error.set('')
    this.#subscription = this.#copilotProviderService
      .create({
        copilotId: this.copilot().id,
        providerName: this.provider().provider,
        credentials: {
          ...this.credentials()
        }
      })
      .subscribe({
        next: (copilotProvider) => {
          this.loading.set(false)
          this.#toastr.success('PAC.Messages.CreatedSuccessfully', { Default: 'Created successfully' })
          this.#dialogRef.close(copilotProvider)
        },
        error: (err) => {
          this.loading.set(false)
          this.error.set(getErrorMessage(err))
          this.#toastr.error(getErrorMessage(err))
        }
      })
  }

  update() {
    this.loading.set(true)
    this.error.set('')
    this.#subscription = this.#copilotProviderService
      .update(this.providerId(), {
        copilotId: this.copilot().id,
        providerName: this.provider().provider,
        credentials: {
          ...this.credentials()
        }
      })
      .subscribe({
        next: (copilotProvider) => {
          this.loading.set(false)
          this.#toastr.success('PAC.Messages.UpdatedSuccessfully', { Default: 'Updated successfully' })
          this.#dialogRef.close(copilotProvider)
        },
        error: (err) => {
          this.loading.set(false)
          this.error.set(getErrorMessage(err))
          this.#toastr.error(getErrorMessage(err))
        }
      })
  }
}
