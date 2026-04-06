import { TextFieldModule } from '@angular/cdk/text-field'
import { Component, computed, effect, inject, signal, viewChild } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { ActivatedRoute, Router } from '@angular/router'
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'
import { IsDirty } from '@metad/core'
import { IIntegration } from '@metad/contracts'
import { NgmInputComponent, NgmSpinComponent } from '@metad/ocap-angular/common'
import { ButtonGroupDirective, NgmI18nPipe } from '@metad/ocap-angular/core'
import { DisplayBehaviour } from '@metad/ocap-core'
import { ContentLoaderModule } from '@ngneat/content-loader'
import { FormlyModule } from '@ngx-formly/core'
import { TranslateModule } from '@ngx-translate/core'
import { EmojiAvatarComponent, IconComponent } from 'apps/cloud/src/app/@shared/avatar'
import { CardProComponent } from 'apps/cloud/src/app/@shared/card'
import { ParameterFormComponent } from 'apps/cloud/src/app/@shared/forms'
import { NgmSelectComponent } from '@cloud/app/@shared/common'
import { environment } from '@cloud/environments/environment'
import { ZardButtonComponent, ZardIconComponent, ZardInputDirective, ZardTooltipImports } from '@xpert-ai/headless-ui'
import omit from 'lodash-es/omit'
import { derivedFrom } from 'ngxtension/derived-from'
import { injectParams } from 'ngxtension/inject-params'
import { injectQueryParams } from 'ngxtension/inject-query-params'
import { distinctUntilChanged, EMPTY, map, pipe, startWith, switchMap } from 'rxjs'
import {
  getErrorMessage,
  IntegrationService,
  normalizeIntegrationTestResult,
  pickIntegrationTestFormPatch,
  ToastrService,
  type IntegrationTestProbe,
  type IntegrationTestResult
} from '../../../../@core'

@Component({
  standalone: true,
  selector: 'pac-settings-integration-configuration',
  templateUrl: './configuration.component.html',
  imports: [
    TranslateModule,
    FormsModule,
    ReactiveFormsModule,
    FormlyModule,
    TextFieldModule,
    ...ZardTooltipImports,
    ZardIconComponent,
    ZardInputDirective,
    ZardButtonComponent,
    ContentLoaderModule,
    ButtonGroupDirective,
    NgmSelectComponent,
    NgmInputComponent,
    NgmSpinComponent,
    EmojiAvatarComponent,
    ParameterFormComponent,
    CardProComponent,
    NgmI18nPipe,
    IconComponent
  ]
})
export class IntegrationConfigurationComponent implements IsDirty {
  readonly DisplayBehaviour = DisplayBehaviour
  readonly pro = environment.pro

  readonly integrationAPI = inject(IntegrationService)
  readonly #toastr = inject(ToastrService)
  readonly #router = inject(Router)
  readonly #route = inject(ActivatedRoute)

  readonly providerQuery = injectQueryParams('provider')
  readonly slackAuthQuery = injectQueryParams('slackAuth')
  readonly slackErrorQuery = injectQueryParams('slackError')
  readonly paramId = injectParams('id')

  readonly providersResource = toSignal(this.integrationAPI.getProviders(), { initialValue: [] })
  readonly optionsForm = viewChild('optionsForm', { read: ParameterFormComponent })

  readonly providers = computed(() =>
    this.providersResource()?.map((provider) => ({
      value: provider.name,
      label: provider.label,
      description: provider.description,
      avatar: provider.avatar,
      _icon: provider.icon
    }))
  )

  readonly formGroup = new FormGroup({
    id: new FormControl(null),
    name: new FormControl(null, [Validators.required]),
    avatar: new FormControl(null),
    description: new FormControl(null),
    slug: new FormControl(null),
    provider: new FormControl(null),
    options: new FormControl(null),
    features: new FormControl([])
  })

  readonly provider = toSignal(
    this.formGroup.get('provider').valueChanges.pipe(startWith(this.formGroup.get('provider').value), distinctUntilChanged())
  )

  readonly integrationProvider = computed(() => this.providersResource().find((provider) => provider.name === this.provider()))
  readonly schema = computed(() => this.integrationProvider()?.schema)

  readonly integration = derivedFrom(
    [this.paramId],
    pipe(
      distinctUntilChanged(),
      switchMap(([id]) => (id ? this.integrationAPI.getById(id) : EMPTY))
    ),
    {
      initialValue: null
    }
  )

  readonly loading = signal(true)
  readonly testResult = signal<IntegrationTestResult | null>(null)
  readonly webhookUrl = computed(() => this.testResult()?.webhookUrl ?? '')
  readonly callbackUrl = computed(() => this.testResult()?.callbackUrl ?? '')
  readonly authorizationUrl = computed(() => this.testResult()?.authorizationUrl ?? '')
  readonly longConnectionProbe = computed<IntegrationTestProbe | null>(() => this.testResult()?.probe ?? null)
  readonly testWarnings = computed(() => this.testResult()?.warnings ?? [])
  readonly isSlackProvider = computed(() => this.provider() === 'slack')
  readonly optionsValue = toSignal(
    this.optionsControl.valueChanges.pipe(startWith(this.optionsControl.value)),
    { initialValue: this.optionsControl.value }
  )

  constructor() {
    effect(() => {
      if (this.providerQuery() && !this.paramId()) {
        this.formGroup.get('provider').setValue(this.providerQuery())
      }
    })

    effect(() => {
      const integration = this.integration()

      if (integration) {
        this.formGroup.patchValue(integration)
      }

      this.formGroup.markAsPristine()
      this.loading.set(false)
    })

    effect(() => {
      if (this.integrationProvider()) {
        this.formGroup.get('features').setValue(this.integrationProvider().features || [])
      }
    })

    effect(
      () => {
        this.provider()
        this.optionsValue()
        this.testResult.set(null)
      },
      { allowSignalWrites: true }
    )

    effect(() => {
      const slackAuth = this.slackAuthQuery()
      const slackError = this.slackErrorQuery()

      if (!slackAuth && !slackError) {
        return
      }

      if (slackAuth === 'success') {
        this.#toastr.success('PAC.Messages.UpdatedSuccessfully', { Default: 'Slack authorization succeeded.' })
      } else {
        this.#toastr.error(slackError || 'Slack authorization failed')
      }

      void this.#router.navigate([], {
        relativeTo: this.#route,
        queryParams: {
          slackAuth: null,
          slackError: null
        },
        queryParamsHandling: 'merge',
        replaceUrl: true
      })
    })

    effect(() => {
      if (!this.integration() || !this.paramId() || this.provider() !== 'slack') {
        return
      }

      this.runTest(false, false)
    })
  }

  get optionsControl() {
    return this.formGroup.get('options') as FormControl
  }

  get optionsInvalid() {
    return this.optionsForm()?.invalid
  }

  get name() {
    return this.formGroup.value?.name
  }

  isDirty(): boolean {
    return this.formGroup.dirty
  }

  test() {
    this.runTest(true, true)
  }

  openAuthorizationUrl() {
    const authorizationUrl = this.authorizationUrl()
    if (authorizationUrl) {
      window.location.assign(authorizationUrl)
    }
  }

  upsert() {
    ;(this.formGroup.value.id
      ? this.integrationAPI.update(this.formGroup.value.id, {
          ...this.formGroup.value
        })
      : this.integrationAPI.create(omit(this.formGroup.value, 'id'))
    ).subscribe({
      next: (integration) => {
        const savedIntegration = isIntegrationEntity(integration) ? integration : null

        this.formGroup.markAsPristine()
        this.#toastr.success('PAC.Messages.CreatedSuccessfully', { Default: 'Created Successfully!' })

        if ((savedIntegration?.provider || this.provider()) === 'slack') {
          if (!this.paramId() && savedIntegration?.id) {
            void this.#router.navigate(['/settings/integration', savedIntegration.id])
            return
          }

          this.runTest(false, false)
          return
        }

        this.#router.navigate(['/settings/integration'])
      },
      error: (error) => {
        this.#toastr.error(getErrorMessage(error))
      }
    })
  }

  cancel() {
    this.close()
  }

  close() {
    this.#router.navigate(['/settings/integration'])
  }

  formatCheckedAt(checkedAt?: number | null) {
    if (!checkedAt) {
      return ''
    }

    return new Date(checkedAt).toLocaleString()
  }

  private runTest(showToast = true, markDirty = true) {
    this.loading.set(true)
    this.testResult.set(null)

    this.integrationAPI.test(this.formGroup.value).subscribe({
      next: (result) => {
        const testResult = normalizeIntegrationTestResult(result)
        const formPatch = pickIntegrationTestFormPatch(result)

        this.testResult.set(testResult)

        if (Object.keys(formPatch).length) {
          this.formGroup.patchValue(formPatch)
        }

        if (markDirty) {
          this.formGroup.markAsDirty()
        } else {
          this.formGroup.markAsPristine()
        }

        this.loading.set(false)

        if (showToast) {
          this.#toastr.success('PAC.Messages.TestSuccessfully', { Default: 'Test successfully!' })
        }
      },
      error: (error) => {
        this.#toastr.danger(getErrorMessage(error))
        this.loading.set(false)
        this.testResult.set(null)
      }
    })
  }
}

function isIntegrationEntity(value: unknown): value is IIntegration {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  return typeof Reflect.get(value, 'provider') === 'string' && typeof Reflect.get(value, 'id') === 'string'
}
