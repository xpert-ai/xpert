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
import { RuntimePanelComponent } from '@cloud/app/@shared/integration'
import { environment } from '@cloud/environments/environment'
import { IsDirty } from '@metad/core'
import { NgmInputComponent, NgmSpinComponent } from '@metad/ocap-angular/common'
import { ButtonGroupDirective, NgmI18nPipe } from '@metad/ocap-angular/core'
import { ContentLoaderModule } from '@ngneat/content-loader'
import { FormlyModule } from '@ngx-formly/core'
import { TranslateModule } from '@ngx-translate/core'
import { EmojiAvatarComponent, IconComponent } from 'apps/cloud/src/app/@shared/avatar'
import { CardProComponent } from 'apps/cloud/src/app/@shared/card'
import { ParameterFormComponent } from 'apps/cloud/src/app/@shared/forms'
import cloneDeep from 'lodash-es/cloneDeep'
import isEqual from 'lodash-es/isEqual'
import omit from 'lodash-es/omit'
import { derivedFrom } from 'ngxtension/derived-from'
import { injectParams } from 'ngxtension/inject-params'
import { injectQueryParams } from 'ngxtension/inject-query-params'
import { distinctUntilChanged, EMPTY, firstValueFrom, map, pipe, startWith, switchMap } from 'rxjs'
import {
  getErrorMessage,
  IntegrationAction,
  IntegrationRuntimeView,
  IntegrationTestView,
  IntegrationService,
  routeAnimations,
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
    IconComponent,
    RuntimePanelComponent
  ],
  animations: [routeAnimations]
})
export class IntegrationComponent implements IsDirty {
  pro = environment.pro

  readonly integrationAPI = inject(IntegrationService)
  readonly #toastr = inject(ToastrService)
  readonly #router = inject(Router)
  readonly #route = inject(ActivatedRoute)
  readonly _providerQuery = injectQueryParams('provider')

  readonly paramId = injectParams('id')
  readonly #providers = toSignal(this.integrationAPI.getProviders(), { initialValue: [] })

  readonly optionsForm = viewChild('optionsForm', { read: ParameterFormComponent })

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
  readonly testView = signal<IntegrationTestView | null>(null)
  readonly runtimeView = signal<IntegrationRuntimeView | null>(null)
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

  constructor() {
    effect(
      () => {
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
        if (!integration?.id) {
          this.runtimeView.set(null)
          return
        }

        this.#refreshRuntimeView(integration.id)
      },
      { allowSignalWrites: true }
    )
  }

  isDirty(): boolean {
    return this.formGroup.dirty
  }

  test() {
    this.loading.set(true)
    this.integrationAPI.test(this.formGroup.value).subscribe({
      next: (result) => {
        this.testView.set(result ?? null)
        this.webhookUrl.set(result?.webhookUrl ?? '')
        this.loading.set(false)

        if (this.#hasTone(result, 'danger')) {
          this.#toastr.warning(this.#firstSectionMessage(result, 'danger') || 'Test completed with warnings.')
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

    const isUpdate = !!this.formGroup.value.id
    const payload = isUpdate
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
        this.loading.set(false)

        if (isUpdate) {
          this.#toastr.success('PAC.Messages.UpdatedSuccessfully', { Default: 'Updated Successfully!' })
          if (integrationId) {
            this.#refreshRuntimeView(integrationId)
          }
          return
        }

        this.#toastr.success('PAC.Messages.CreatedSuccessfully', { Default: 'Created Successfully!' })
        if (integrationId) {
          this.#router.navigate(['../', integrationId], { relativeTo: this.#route })
        } else {
          this.#router.navigate(['..'], { relativeTo: this.#route })
        }
      },
      error: (error) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(error))
      }
    })
  }

  async handleRuntimeAction(action: IntegrationAction) {
    const integrationId = this.formGroup.value.id
    if (!integrationId) {
      return
    }

    if (action.confirmText) {
      const confirmed = await firstValueFrom(
        this.#toastr.confirm(
          {
            code: action.confirmText,
            params: { Default: action.confirmText }
          },
          {
            verticalPosition: 'top'
          }
        )
      )

      if (!confirmed) {
        return
      }
    }

    this.loading.set(true)
    this.integrationAPI.runRuntimeAction(integrationId, action.key).subscribe({
      next: (view) => {
        this.#applyRuntimeView(view)
        this.loading.set(false)

        if (this.#hasTone(view, 'danger')) {
          this.#toastr.warning(this.#firstSectionMessage(view, 'danger') || 'Runtime action completed with warnings.')
          return
        }

        this.#toastr.success('PAC.Messages.UpdatedSuccessfully', { Default: 'Updated Successfully!' })
      },
      error: (error) => {
        this.loading.set(false)
        this.#toastr.error(getErrorMessage(error))
      }
    })
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
    this.testView.set(null)
    this.runtimeView.set(null)
  }

  cancel() {
    this.close()
  }

  close(refresh = false) {
    this.#router.navigate(['../'], { relativeTo: this.#route })
  }

  #refreshRuntimeView(integrationId: string) {
    this.integrationAPI.getRuntimeView(integrationId).subscribe({
      next: (view) => this.#applyRuntimeView(view),
      error: () => this.runtimeView.set(null)
    })
  }

  #applyRuntimeView(view: IntegrationRuntimeView | null | undefined) {
    this.runtimeView.set(view?.supported ? view : null)
  }

  #hasTone(view: Pick<IntegrationTestView, 'sections'> | Pick<IntegrationRuntimeView, 'sections'> | null | undefined, tone: string) {
    return !!view?.sections?.some((section) => section.tone === tone)
  }

  #firstSectionMessage(
    view: Pick<IntegrationTestView, 'sections'> | Pick<IntegrationRuntimeView, 'sections'> | null | undefined,
    tone?: string
  ) {
    return (
      view?.sections?.find((section) => (!tone || section.tone === tone) && section.messages?.length)?.messages?.[0] || ''
    )
  }
}
