import { Component, computed, effect, inject, signal, viewChild } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'
import { MatButtonModule } from '@angular/material/button'
import { MatDialog } from '@angular/material/dialog'
import { MatIconModule } from '@angular/material/icon'
import { MatInputModule } from '@angular/material/input'
import { MatTooltipModule } from '@angular/material/tooltip'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import { IsDirty } from '@metad/core'
import { NgmInputComponent, NgmSelectComponent, NgmSpinComponent } from '@metad/ocap-angular/common'
import { ButtonGroupDirective, NgmI18nPipe } from '@metad/ocap-angular/core'
import { DisplayBehaviour } from '@metad/ocap-core'
import { ContentLoaderModule } from '@ngneat/content-loader'
import { FormlyModule } from '@ngx-formly/core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { EmojiAvatarComponent } from 'apps/cloud/src/app/@shared/avatar'
import omit from 'lodash-es/omit'
import { derivedFrom } from 'ngxtension/derived-from'
import { injectParams } from 'ngxtension/inject-params'
import { BehaviorSubject, distinctUntilChanged, EMPTY, map, pipe, startWith, switchMap } from 'rxjs'
import {
  getErrorMessage,
  injectApiBaseUrl,
  injectTranslate,
  INTEGRATION_PROVIDERS,
  IntegrationService,
  routeAnimations,
  Store,
  TIntegrationProvider,
  ToastrService,
} from '../../../../@core'
import { TextFieldModule } from '@angular/cdk/text-field'
import { ParameterFormComponent } from 'apps/cloud/src/app/@shared/forms'
import { CardProComponent } from 'apps/cloud/src/app/@shared/card'
import { environment } from '@cloud/environments/environment'

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
    CardProComponent
  ],
  animations: [routeAnimations]
})
export class IntegrationComponent implements IsDirty {
  DisplayBehaviour = DisplayBehaviour
  pro = environment.pro

  readonly integrationService = inject(IntegrationService)
  readonly #toastr = inject(ToastrService)
  readonly #store = inject(Store)
  readonly #router = inject(Router)
  readonly #route = inject(ActivatedRoute)
  readonly #dialog = inject(MatDialog)
  readonly #translate = inject(TranslateService)
  readonly apiBaseUrl = injectApiBaseUrl()
  readonly i18n = new NgmI18nPipe()
  readonly integrationI18n = injectTranslate('PAC.Integration')

  readonly paramId = injectParams('id')

  // Childs
  readonly optionsForm = viewChild('optionsForm', {read: ParameterFormComponent})

  // States
  readonly organizationId$ = this.#store.selectOrganizationId()

  readonly refresh$ = new BehaviorSubject<boolean>(true)

  readonly providers = signal(
    Object.keys(INTEGRATION_PROVIDERS).map((name) => ({
      key: name,
      caption: this.i18n.transform(INTEGRATION_PROVIDERS[name].label)
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
  })

  get optionsControl() {
    return this.formGroup.get('options') as FormControl
  }

  get optionsInvalid() {
    return this.optionsForm()?.invalid
  }

  readonly provider = this.formGroup.get('provider')
  readonly integrationProvider = toSignal<TIntegrationProvider>(
    this.provider.valueChanges.pipe(
      startWith(this.provider.value),
      map((provider) => INTEGRATION_PROVIDERS[provider])
    )
  )

  readonly schema = computed(() => this.integrationProvider()?.schema)

  readonly integration = derivedFrom(
    [this.paramId],
    pipe(
      distinctUntilChanged(),
      switchMap(([id]) => (id ? this.integrationService.getById(id) : EMPTY))
    ),
    {
      initialValue: null
    }
  )

  readonly loading = signal(true)

  readonly webhookUrl = computed(() =>
    this.integration() && this.integrationProvider()?.webhookUrl ? this.integrationProvider().webhookUrl(this.integration(), this.apiBaseUrl) : null
  )

  constructor() {
    effect(
      () => {
        if (this.integration()) {
          this.formGroup.patchValue(this.integration())
        } else {
          this.formGroup.reset()
        }
        this.formGroup.markAsPristine()
        this.loading.set(false)
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
    this.loading.set(true)
    this.integrationService.test(this.formGroup.value).subscribe({
      next: (result) => {
        this.formGroup.patchValue(result)
        this.formGroup.markAsDirty()
        this.loading.set(false)
        this.#toastr.success('PAC.Messages.TestSuccessfully', {Default: 'Test successfully!'})
      },
      error: (error) => {
        this.#toastr.danger(getErrorMessage(error))
        this.loading.set(false)
      }
    })
  }

  upsert() {
    (this.formGroup.value.id
      ? this.integrationService.update(this.formGroup.value.id, {
          ...this.formGroup.value
        })
      : this.integrationService.create(omit(this.formGroup.value, 'id'))
    ).subscribe({
      next: () => {
        this.formGroup.markAsPristine()
        this.#toastr.success('PAC.Messages.CreatedSuccessfully', { Default: 'Created Successfully!' })
        this.#router.navigate(['..'], { relativeTo: this.#route })
      },
      error: (error) => {
        this.#toastr.error(getErrorMessage(error))
      }
    })
  }

  cancel() {
    this.close()
  }

  close(refresh = false) {
    this.#router.navigate(['../'], { relativeTo: this.#route })
  }

}
