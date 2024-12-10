import { AsyncPipe } from '@angular/common'
import { Component, computed, effect, inject, signal } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'
import { MatDialog } from '@angular/material/dialog'
import { ActivatedRoute, Router, RouterModule } from '@angular/router'
import { NgmInputComponent, NgmSelectComponent } from '@metad/ocap-angular/common'
import { AppearanceDirective, ButtonGroupDirective, DensityDirective } from '@metad/ocap-angular/core'
import { assign, DisplayBehaviour } from '@metad/ocap-core'
import { ContentLoaderModule } from '@ngneat/content-loader'
import { FormlyModule } from '@ngx-formly/core'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import { environment } from 'apps/cloud/src/environments/environment'
import { derivedFrom } from 'ngxtension/derived-from'
import { injectParams } from 'ngxtension/inject-params'
import { BehaviorSubject, distinctUntilChanged, EMPTY, map, pipe, startWith, switchMap } from 'rxjs'
import {
  convertConfigurationSchema,
  getErrorMessage,
  INTEGRATION_PROVIDERS,
  IntegrationEnum,
  IntegrationService,
  routeAnimations,
  Store,
  ToastrService
} from '../../../../@core'
import { IsDirty } from '@metad/core'
import omit from 'lodash-es/omit'
import { EmojiAvatarComponent } from 'apps/cloud/src/app/@shared/avatar'
import { MaterialModule } from 'apps/cloud/src/app/@shared/material.module'

@Component({
  standalone: true,
  selector: 'pac-settings-integration',
  templateUrl: './integration.component.html',
  styleUrls: ['./integration.component.scss'],
  imports: [
    AsyncPipe,
    RouterModule,
    TranslateModule,
    FormsModule,
    ReactiveFormsModule,
    FormlyModule,
    ContentLoaderModule,
    MaterialModule,
    ButtonGroupDirective,
    AppearanceDirective,
    DensityDirective,
    NgmSelectComponent,
    NgmInputComponent,
    EmojiAvatarComponent
  ],
  animations: [routeAnimations]
})
export class IntegrationComponent implements IsDirty {
  DisplayBehaviour = DisplayBehaviour

  readonly integrationService = inject(IntegrationService)
  readonly #toastr = inject(ToastrService)
  readonly #store = inject(Store)
  readonly #router = inject(Router)
  readonly #route = inject(ActivatedRoute)
  readonly #dialog = inject(MatDialog)
  readonly #translate = inject(TranslateService)

  readonly paramId = injectParams('id')

  readonly organizationId$ = this.#store.selectOrganizationId()

  readonly refresh$ = new BehaviorSubject<boolean>(true)

  readonly providers = signal([
    {
      key: IntegrationEnum.LARK,
      caption: 'Lark'
    }
  ])

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

  readonly provider = this.formGroup.get('provider')
  readonly integrationProvider = toSignal(
    this.provider.valueChanges.pipe(
      startWith(this.provider.value),
      map((provider) => INTEGRATION_PROVIDERS[provider])
    )
  )

  readonly i18n = toSignal(this.#translate.stream('PAC.Integration'))
  readonly schema = computed(() =>
    this.integrationProvider() ? convertConfigurationSchema(this.integrationProvider().schema, this.i18n()) : null
  )

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
    this.integration() ?
    this.integrationProvider()?.webhookUrl(this.integration(), environment.API_BASE_URL) : null
  )

  optionsModel = {}
  formOptions = {}

  constructor() {
    effect(
      () => {
        if (this.integration()) {
          this.formGroup.patchValue(this.integration())
          assign(this.optionsModel, this.integration().options)
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
      },
      error: (error) => {
        this.#toastr.danger(getErrorMessage(error))
        this.loading.set(false)
      }
    })
  }

  upsert() {
    ;(this.formGroup.value.id
      ? this.integrationService.update(this.formGroup.value.id, {
        ...this.formGroup.value
      }) : this.integrationService.create(omit(this.formGroup.value, 'id'))
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
