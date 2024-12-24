import { CdkListboxModule } from '@angular/cdk/listbox'
import { TextFieldModule } from '@angular/cdk/text-field'
import { CommonModule } from '@angular/common'
import { Component, computed, effect, inject, model, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'
import { MatInputModule } from '@angular/material/input'
import { NgmInputComponent, NgmSpinComponent } from '@metad/ocap-angular/common'
import { NgmI18nPipe } from '@metad/ocap-angular/core'
import { ContentLoaderModule } from '@ngneat/content-loader'
import { FormlyModule } from '@ngx-formly/core'
import { TranslateModule } from '@ngx-translate/core'
import { assign, omit } from 'lodash-es'
import { map, startWith } from 'rxjs'
import { injectApiBaseUrl, injectToastr, IntegrationService, toFormlySchema } from '../../../@core'
import { getErrorMessage, IIntegration, INTEGRATION_PROVIDERS } from '../../../@core/types'
import { EmojiAvatarComponent } from '../../avatar'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    CdkListboxModule,
    TextFieldModule,
    TranslateModule,
    ContentLoaderModule,
    FormlyModule,
    MatInputModule,
    EmojiAvatarComponent,
    NgmInputComponent,
    NgmSpinComponent
  ],
  selector: 'pac-integration-form',
  templateUrl: 'integration.component.html',
  styleUrls: ['integration.component.scss']
})
export class IntegrationFormComponent {
  readonly integrationService = inject(IntegrationService)
  readonly #toastr = injectToastr()
  readonly apiBaseUrl = injectApiBaseUrl()
  readonly i18n = new NgmI18nPipe()

  readonly integration = model<IIntegration>()

  readonly formGroup = new FormGroup({
    id: new FormControl(null),
    name: new FormControl(null, [Validators.required]),
    avatar: new FormControl(null),
    description: new FormControl(null),
    slug: new FormControl(null),
    provider: new FormControl(null),
    options: new FormGroup({})
  })

  get optionsForm() {
    return this.formGroup.get('options') as FormGroup
  }

  optionsModel = {}
  formOptions = {}

  readonly providers = signal(
    Object.keys(INTEGRATION_PROVIDERS).map((name) => ({
      key: name,
      caption: this.i18n.transform(INTEGRATION_PROVIDERS[name].label)
    }))
  )
  readonly provider = this.formGroup.get('provider')
  readonly integrationProvider = toSignal(
    this.provider.valueChanges.pipe(
      startWith(this.provider.value),
      map((provider) => INTEGRATION_PROVIDERS[provider])
    )
  )

  readonly schema = computed(() => {
    const schema = this.integrationProvider()?.schema
    return schema
      ? toFormlySchema(
          {
            ...schema,
            properties: omit(schema.properties, 'xpertId')
          },
          this.i18n
        )
      : null
  })

  readonly webhookUrl = computed(() =>
    this.integration() ? this.integrationProvider()?.webhookUrl(this.integration(), this.apiBaseUrl) : null
  )

  readonly loading = signal(false)

  constructor() {
    effect(
      () => {
        if (this.integration()) {
          this.formGroup.patchValue(this.integration())
          assign(this.optionsModel, this.integration().options)
          if (this.integration().id) {
            this.formGroup.markAsPristine()
          } else {
            this.formGroup.markAsDirty()
          }
        }
      },
      { allowSignalWrites: true }
    )
  }

  compareId(a: IIntegration, b: IIntegration): boolean {
    return a?.id === b?.id
  }

  getProvider(integration?: IIntegration) {
    return INTEGRATION_PROVIDERS[integration.name]
  }

  onModelChange(model) {
    console.log(model)
    this.integration.set(model)
  }

  test() {
    this.loading.set(true)
    this.integrationService.test({ ...this.formGroup.value }).subscribe({
      next: (result) => {
        this.formGroup.patchValue(result)
        this.formGroup.markAsDirty()
        this.loading.set(false)
        this.#toastr.success('PAC.Messages.Successfully', { Default: 'Successfully!' })
      },
      error: (error) => {
        this.#toastr.danger(getErrorMessage(error))
        this.loading.set(false)
      }
    })
  }
}
