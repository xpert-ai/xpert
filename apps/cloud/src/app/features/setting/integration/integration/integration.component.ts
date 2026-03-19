import { TextFieldModule } from '@angular/cdk/text-field'
import { Component, computed, effect, inject, signal, viewChild } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatIconModule } from '@angular/material/icon'
import { MatInputModule } from '@angular/material/input'
import { MatTooltipModule } from '@angular/material/tooltip'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import { NgmSelectComponent } from '@cloud/app/@shared/common'
import { environment } from '@cloud/environments/environment'
import { IsDirty } from '@metad/core'
import { NgmInputComponent, NgmSpinComponent } from '@metad/ocap-angular/common'
import { ButtonGroupDirective, NgmI18nPipe } from '@metad/ocap-angular/core'
import { DisplayBehaviour } from '@metad/ocap-core'
import { ContentLoaderModule } from '@ngneat/content-loader'
import { FormlyModule } from '@ngx-formly/core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { EmojiAvatarComponent, IconComponent } from 'apps/cloud/src/app/@shared/avatar'
import { CardProComponent } from 'apps/cloud/src/app/@shared/card'
import { ParameterFormComponent } from 'apps/cloud/src/app/@shared/forms'
import cloneDeep from 'lodash-es/cloneDeep'
import isEqual from 'lodash-es/isEqual'
import omit from 'lodash-es/omit'
import { derivedFrom } from 'ngxtension/derived-from'
import { injectParams } from 'ngxtension/inject-params'
import { injectQueryParams } from 'ngxtension/inject-query-params'
import { BehaviorSubject, distinctUntilChanged, EMPTY, map, pipe, startWith, switchMap } from 'rxjs'
import {
  getErrorMessage,
  injectApiBaseUrl,
  IntegrationTestResult,
  injectTranslate,
  IntegrationService,
  LarkRuntimeStatus,
  routeAnimations,
  Store,
  ToastrService
} from '../../../../@core'

@Component({
  standalone: true,
  selector: 'pac-settings-integration',
  templateUrl: './integration.component.html',
  styleUrls: ['./integration.component.scss'],
  imports: [
    RouterModule,
    TranslateModule,
    FormsModule,
    ReactiveFormsModule,
    FormlyModule,
    TextFieldModule,
    MatTooltipModule,
    MatIconModule,
    MatInputModule,
    MatButtonModule,
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
  ],
  animations: [routeAnimations]
})
export class IntegrationComponent implements IsDirty {
  DisplayBehaviour = DisplayBehaviour
  pro = environment.pro

  readonly integrationAPI = inject(IntegrationService)
  readonly #toastr = inject(ToastrService)
  readonly #store = inject(Store)
  readonly #router = inject(Router)
  readonly #route = inject(ActivatedRoute)
  readonly #translate = inject(TranslateService)
  readonly apiBaseUrl = injectApiBaseUrl()
  readonly i18n = new NgmI18nPipe()
  readonly integrationI18n = injectTranslate('PAC.Integration')
  readonly _providerQuery = injectQueryParams('provider')

  readonly paramId = injectParams('id')
  readonly #providers = toSignal(this.integrationAPI.getProviders(), { initialValue: [] })

  // Childs
  readonly optionsForm = viewChild('optionsForm', { read: ParameterFormComponent })

  // States
  readonly organizationId$ = this.#store.selectOrganizationId()

  readonly refresh$ = new BehaviorSubject<boolean>(true)

  readonly providers = computed(() => {
    return this.#providers()?.map((provider) => ({
      value: provider.name,
      label: provider.label,
      description: provider.description,
      avatar: provider.avatar,
      _icon: provider.icon
    }))
  })

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

  get optionsControl() {
    return this.formGroup.get('options') as FormControl
  }

  get optionsInvalid() {
    return this.optionsForm()?.invalid
  }

  get name() {
    return this.formGroup.value?.name
  }

  readonly provider = toSignal(
    this.formGroup
      .get('provider')
      .valueChanges.pipe(startWith(this.formGroup.get('provider').value), distinctUntilChanged())
  )

  readonly integrationProvider = computed(() => this.#providers().find((p) => p.name === this.provider()))

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

  readonly webhookUrl = signal('')
  readonly larkTestResult = signal<IntegrationTestResult | null>(null)
  readonly larkRuntimeStatus = signal<LarkRuntimeStatus | null>(null)
  readonly isLarkProvider = computed(() => this.provider() === 'lark')
  readonly optionsValue = toSignal(
    this.optionsControl.valueChanges.pipe(
      startWith(this.optionsControl.value),
      map((value) => cloneDeep(value)),
      distinctUntilChanged(isEqual)
    ),
    {
      initialValue: cloneDeep(this.optionsControl.value)
    }
  )
  readonly isLongConnectionMode = computed(
    () => this.optionsValue()?.connectionMode === 'long_connection'
  )

  constructor() {
    effect(
      () => {
        // Set provider from query when create new integration
        if (this._providerQuery() && !this.paramId()) {
          this.formGroup.get('provider').setValue(this._providerQuery())
        }
      },
      { allowSignalWrites: true }
    )

    effect(
      () => {
        if (this.integration()) {
          this.formGroup.patchValue(this.integration())
        } else {
          // this.formGroup.reset()
        }
        this.formGroup.markAsPristine()
        this.loading.set(false)
      },
      { allowSignalWrites: true }
    )

    effect(
      () => {
        if (this.integrationProvider()) {
          this.formGroup.get('features').setValue(this.integrationProvider().features || [])
        }
      },
      { allowSignalWrites: true }
    )

    effect(
      () => {
        const integration = this.integration()
        if (!integration?.id || !this.isLarkProvider() || !this.isLongConnectionMode()) {
          this.larkRuntimeStatus.set(null)
          return
        }

        this.integrationAPI.getLarkRuntimeStatus(integration.id).subscribe({
          next: (status) => this.larkRuntimeStatus.set(status),
          error: () => this.larkRuntimeStatus.set(null)
        })
      },
      { allowSignalWrites: true }
    )
  }

  isDirty(): boolean {
    return this.formGroup.dirty
  }

  refresh() {
    this.refresh$.next(true)
  }

  test() {
    if (this.formGroup.value.id && this.isLarkProvider() && this.isLongConnectionMode()) {
      this.loading.set(true)
      this.integrationAPI.reconnectLarkRuntimeStatus(this.formGroup.value.id).subscribe({
        next: (status) => {
          this.larkRuntimeStatus.set(status)
          this.larkTestResult.update((result) => ({
            ...(result ?? {}),
            mode: 'long_connection',
            capabilities: status.capabilities ?? result?.capabilities,
            warnings:
              status.connected || status.state === 'connected'
                ? ['Long connection activation succeeded.']
                : [status.lastError || 'Long connection activation did not succeed yet.']
          }))
          this.loading.set(false)
          if (status.connected || status.state === 'connected') {
            this.#toastr.success('PAC.Messages.TestSuccessfully', { Default: 'Long connection activated!' })
            return
          }
          this.#toastr.warning(status.lastError || 'Long connection activation did not succeed yet.')
        },
        error: (error) => {
          this.loading.set(false)
          this.#toastr.danger(getErrorMessage(error))
        }
      })
      return
    }

    this.loading.set(true)
    this.integrationAPI.test(this.formGroup.value).subscribe({
      next: (result) => {
        this.larkTestResult.set(result ?? null)
        if (result?.webhookUrl) {
          this.webhookUrl.set(result.webhookUrl)
        } else {
          this.webhookUrl.set('')
        }
        this.loading.set(false)
        if (result?.probe && !result.probe.connected) {
          this.#toastr.warning(result.probe.lastError || 'Long connection probe failed.')
          return
        }
        this.#toastr.success('PAC.Messages.TestSuccessfully', { Default: 'Test successfully!' })
      },
      error: (error) => {
        this.#toastr.danger(getErrorMessage(error))
        this.loading.set(false)
      }
    })
  }

  upsert() {
    this.loading.set(true)
    const payload = this.formGroup.value.id
      ? this.integrationAPI.update(this.formGroup.value.id, {
          ...this.formGroup.value
        })
      : this.integrationAPI.create(omit(this.formGroup.value, 'id'))

    payload.subscribe({
      next: (integration: any) => {
        const integrationId = integration?.id || this.formGroup.value.id
        if (integration?.id && integration?.id !== this.formGroup.value.id) {
          this.formGroup.patchValue({ id: integration.id }, { emitEvent: false })
        }
        this.formGroup.markAsPristine()
        if (integrationId && this.isLarkProvider() && this.isLongConnectionMode()) {
          this.integrationAPI.reconnectLarkRuntimeStatus(integrationId).subscribe({
            next: (status) => {
              this.larkRuntimeStatus.set(status)
              this.loading.set(false)
              this.#toastr.success('PAC.Messages.UpdatedSuccessfully', {
                Default: 'Saved successfully and long connection activation requested!'
              })
              if (!this.paramId() && integrationId) {
                this.#router.navigate(['../', integrationId], { relativeTo: this.#route })
              }
            },
            error: (error) => {
              this.loading.set(false)
              this.#toastr.warning(
                getErrorMessage(error) || 'Saved successfully, but long connection activation failed.'
              )
              if (!this.paramId() && integrationId) {
                this.#router.navigate(['../', integrationId], { relativeTo: this.#route })
              }
            }
          })
          return
        }

        this.loading.set(false)
        this.#toastr.success('PAC.Messages.CreatedSuccessfully', { Default: 'Created Successfully!' })
        this.#router.navigate(['..'], { relativeTo: this.#route })
      },
      error: (error) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(error))
      }
    })
  }

  reconnectLarkRuntimeStatus() {
    const integrationId = this.formGroup.value.id
    if (!integrationId) {
      return
    }

    this.loading.set(true)
    this.integrationAPI.reconnectLarkRuntimeStatus(integrationId).subscribe({
      next: (status) => {
        this.larkRuntimeStatus.set(status)
        this.loading.set(false)
        this.#toastr.success('PAC.Messages.UpdatedSuccessfully', { Default: 'Long connection reactivated!' })
      },
      error: (error) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(error))
      }
    })
  }

  formatRuntimeTimestamp(value: number | null | undefined) {
    if (!value) {
      return ''
    }
    return new Date(value).toLocaleString()
  }

  onOptionsChange(options: unknown) {
    const currentValue = this.optionsValue()
    const nextValue = cloneDeep(options)
    this.optionsControl.setValue(nextValue)

    if (isEqual(currentValue, nextValue)) {
      return
    }

    this.optionsControl.markAsDirty()
    this.formGroup.markAsDirty()
    this.webhookUrl.set('')
    this.larkTestResult.set(null)
    if (this.formGroup.value.id) {
      this.larkRuntimeStatus.set(null)
    }
  }

  cancel() {
    this.close()
  }

  close(refresh = false) {
    this.#router.navigate(['../'], { relativeTo: this.#route })
  }
}
