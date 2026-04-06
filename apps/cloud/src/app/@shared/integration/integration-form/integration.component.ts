import { CdkListboxModule } from '@angular/cdk/listbox'
import { TextFieldModule } from '@angular/cdk/text-field'

import { Component, computed, effect, inject, model, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'
import { ZardInputDirective } from '@xpert-ai/headless-ui'
import { NgmInputComponent, NgmSpinComponent } from '@metad/ocap-angular/common'
import { NgmI18nPipe } from '@metad/ocap-angular/core'
import { ContentLoaderModule } from '@ngneat/content-loader'
import { FormlyModule } from '@ngx-formly/core'
import { TranslateModule } from '@ngx-translate/core'
import { assign, omit } from 'lodash-es'
import { startWith } from 'rxjs'
import { injectToastr, IntegrationService, toFormlySchema } from '../../../@core'
import { getErrorMessage, IIntegration } from '../../../@core/types'
import { EmojiAvatarComponent } from '../../avatar'

@Component({
  standalone: true,
  imports: [
    FormsModule,
    ReactiveFormsModule,
    CdkListboxModule,
    TextFieldModule,
    TranslateModule,
    ContentLoaderModule,
    FormlyModule,
    ZardInputDirective,
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
  readonly i18n = new NgmI18nPipe()

  readonly integration = model<IIntegration>()
  readonly #providers = toSignal(this.integrationService.getProviders(), { initialValue: [] })

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

  readonly provider = this.formGroup.get('provider')
  readonly providerName = toSignal(this.provider.valueChanges.pipe(startWith(this.provider.value)))
  readonly integrationProvider = computed(() =>
    this.#providers().find((item) => item.name === this.providerName())
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

  readonly webhookUrl = computed(() => {
    const options = this.formGroup.get('options')?.value
    if (!options || typeof options !== 'object' || Array.isArray(options) || !('webhookUrl' in options)) {
      return null
    }

    const candidate = Reflect.get(options, 'webhookUrl')
    return typeof candidate === 'string' && candidate.length > 0 ? candidate : null
  })

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
      }
    )
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
