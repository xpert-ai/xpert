import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, effect, inject, input, model, output, signal } from '@angular/core'
import { outputFromObservable, toSignal } from '@angular/core/rxjs-interop'
import {
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators
} from '@angular/forms'
import { EntriesPipe, routeAnimations } from '@metad/core'
import { pick } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import {
  ApiAuthType,
  ApiToolBundle,
  getErrorMessage,
  IXpertTool,
  IXpertToolset,
  TagCategoryEnum,
  ToastrService,
  XpertToolsetCategoryEnum,
  XpertToolsetService
} from 'apps/cloud/src/app/@core'
import { EmojiAvatarComponent } from 'apps/cloud/src/app/@shared/avatar'
import { combineLatestWith, distinctUntilChanged, filter, map, of, switchMap } from 'rxjs'
import { CdkMenuModule } from '@angular/cdk/menu'
import { Samples } from '../types'
import { XpertToolAuthorizationInputComponent } from '../../authorization'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { XpertToolTestDialogComponent } from '../../tool-test'
import { XpertConfigureToolComponent } from '../../api-tool/types'
import { Dialog } from '@angular/cdk/dialog'
import { TagSelectComponent } from 'apps/cloud/src/app/@shared/tag'
import { XpertToolNameInputComponent } from 'apps/cloud/src/app/@shared/xpert'


@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    CdkMenuModule,
    TranslateModule,
    EntriesPipe,
    EmojiAvatarComponent,
    TagSelectComponent,
    NgmSpinComponent,

    XpertToolAuthorizationInputComponent,
    XpertToolNameInputComponent
  ],
  selector: 'xpert-tool-openapi-configure',
  templateUrl: './configure.component.html',
  styleUrl: 'configure.component.scss',
  animations: [routeAnimations],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: XpertConfigureToolComponent,
      useExisting: XpertStudioConfigureToolComponent
    }
  ]
})
export class XpertStudioConfigureToolComponent extends XpertConfigureToolComponent {
  eTagCategoryEnum = TagCategoryEnum
  eSamples = Samples

  readonly toolsetService = inject(XpertToolsetService)
  readonly #fb = inject(FormBuilder)
  readonly #dialog = inject(Dialog)
  readonly #cdr = inject(ChangeDetectorRef)
  readonly #toastr = inject(ToastrService)

  readonly toolset = input<IXpertToolset>(null)
  readonly loading = signal(false)

  readonly formGroup = new FormGroup({
    id: this.#fb.control(null),
    name: new FormControl(null, [Validators.required]),
    avatar: new FormControl(null),
    description: new FormControl(null),
    schema: new FormControl<string>(null, [Validators.required]),
    type: this.#fb.control('openapi'),
    category: this.#fb.control(XpertToolsetCategoryEnum.API),
    tools: new FormArray([]),
    credentials: this.#fb.control({
      auth_type: ApiAuthType.NONE
    }),
    tags: this.#fb.control(null),
    privacyPolicy: this.#fb.control(null),
    customDisclaimer: this.#fb.control(null),

    options: this.#fb.group({
      baseUrl: this.#fb.control('')
    })
  })

  readonly valueChange = outputFromObservable(this.formGroup.valueChanges)

  readonly isValid = toSignal(this.formGroup.valueChanges.pipe(
    combineLatestWith(this.refresh$),
    map(() => this.formGroup.valid)))
  readonly isDirty = toSignal(this.formGroup.valueChanges.pipe(
    combineLatestWith(this.refresh$),
    map(() => this.formGroup.dirty)))
  
  get name() {
    return this.formGroup.get('name')
  }
  get avatar() {
    return this.formGroup.get('avatar').value
  }
  set avatar(avatar) {
    this.formGroup.patchValue({ avatar })
  }
  get schema() {
    return this.formGroup.get('schema')
  }
  get credentials() {
    return this.formGroup.get('credentials') as FormControl
  }
  get tools() {
    return this.formGroup.get('tools') as FormArray
  }
  get value() {
    return { ...this.formGroup.value }
  }
  get tags() {
    return this.formGroup.get('tags') as FormControl
  }
  get options() {
    return this.formGroup.get('options') as FormGroup
  }
  get baseUrl() {
    return this.options.get('baseUrl') as FormControl
  }

  readonly url = model('')

  readonly schemas = toSignal(
    this.schema.valueChanges.pipe(
      filter(() => !this.toolset()),
      distinctUntilChanged(),
      switchMap((schema) => (!schema?.trim() ? of(null) : this.toolsetService.parserOpenAPISchema(schema)))
    )
  )

  constructor() {
    super()

    effect(() => {
      if (this.schemas()?.parameters_schema) {
        this.tools.clear()
        this.schemas().parameters_schema.forEach((schema) => {
          this.addTool(schema)
        })
      }
    })

    effect(() => {
      this.loading() ? this.formGroup.disable() : this.formGroup.enable()
    }, { allowSignalWrites: true })

    effect(
      () => {
        if (this.toolset() && !this.formGroup.value.id) {
          this.formGroup.patchValue({
            ...pick(
              this.toolset(),
              'id',
              'name',
              'avatar',
              'description',
              'options',
              'schema',
              'type',
              'category',
              'tags',
              'privacyPolicy',
              'customDisclaimer'
            ),
            credentials: this.toolset().credentials ?? {},
            tools: []
          } as any)
          this.#cdr.detectChanges()
        }
      },
      { allowSignalWrites: true }
    )
  }

  addTool(apiBundle: ApiToolBundle) {
    this.tools.push(
      this.#fb.group({
        enabled: this.#fb.control(false),
        options: this.#fb.control({ api_bundle: apiBundle }),
        name: this.#fb.control(apiBundle.operation_id),
        description: this.#fb.control(apiBundle.summary),
        schema: this.#fb.control(apiBundle.schema)
      })
    )
  }

  getMetadata() {
    this.loading.set(true)
    this.toolsetService.getOpenAPIRemoteSchema(this.url(), this.credentials.value).subscribe({
      next: (result) => {
        this.loading.set(false)
        // Handle the success scenario here
        this.formGroup.patchValue({
          schema: result.schema,
        })
      },
      error: (err) => {
        this.#toastr.error(getErrorMessage(err))
        this.loading.set(false)
        // Handle the error scenario here
      }
    })
  }

  triggerSample(name: keyof typeof Samples) {
    this.formGroup.patchValue({
      schema: Samples[name].schema
    })
  }

  openToolTest(tool: Partial<IXpertTool>) {
    this.#dialog.open(XpertToolTestDialogComponent, {
      panelClass: 'medium',
      data: {
        tool: {
          ...tool,
          toolset: this.formGroup.value
        },
        enableAuthorization: true
      }
    }).closed.subscribe({
      next: (result) => {

      }
    })
  }
}
