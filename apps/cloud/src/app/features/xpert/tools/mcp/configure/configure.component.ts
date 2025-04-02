import { CdkListboxModule } from '@angular/cdk/listbox'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  effect,
  inject,
  input,
  model,
  output,
  signal
} from '@angular/core'
import { outputFromObservable, toSignal } from '@angular/core/rxjs-interop'
import { FormBuilder, FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'
import { MatSlideToggleModule } from '@angular/material/slide-toggle'
import { routeAnimations } from '@metad/core'
import { isEqual, pick } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import {
  ApiProviderAuthType,
  IXpertToolset,
  TagCategoryEnum,
  ToastrService,
  XpertToolsetCategoryEnum,
  XpertToolsetService
} from 'apps/cloud/src/app/@core'
import { EmojiAvatarComponent } from 'apps/cloud/src/app/@shared/avatar'
import { TagSelectComponent } from 'apps/cloud/src/app/@shared/tag'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'
import { combineLatestWith, distinctUntilChanged, map, startWith } from 'rxjs/operators'
import { XpertConfigureToolComponent } from '../../api-tool/types'
import { Samples } from '../types'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    CdkMenuModule,
    CdkListboxModule,
    TranslateModule,
    MatSlideToggleModule,

    EmojiAvatarComponent,
    TagSelectComponent
  ],
  selector: 'xpert-tool-mcp-configure',
  templateUrl: './configure.component.html',
  styleUrl: 'configure.component.scss',
  animations: [routeAnimations],
  changeDetection: ChangeDetectionStrategy.OnPush,
  hostDirectives: [NgxControlValueAccessor],
  providers: [
    {
      provide: XpertConfigureToolComponent,
      useExisting: XpertStudioConfigureMCPComponent
    }
  ]
})
export class XpertStudioConfigureMCPComponent extends XpertConfigureToolComponent {
  eTagCategoryEnum = TagCategoryEnum
  eSamples = Samples

  readonly toolsetService = inject(XpertToolsetService)
  readonly #toastr = inject(ToastrService)
  readonly #formBuilder = inject(FormBuilder)
  readonly #cdr = inject(ChangeDetectorRef)
  readonly #fb = inject(FormBuilder)
  protected cva = inject<NgxControlValueAccessor<Partial<IXpertToolset> | null>>(NgxControlValueAccessor)

  // Inputs
  // readonly toolset = input<IXpertToolset>(null)

  readonly formGroup = new FormGroup({
    id: this.#formBuilder.control(null),
    name: new FormControl(null, [Validators.required]),
    avatar: new FormControl({
      url: '/assets/icons/mcp.png'
    }),
    description: new FormControl(null),
    category: this.#formBuilder.control(XpertToolsetCategoryEnum.MCP),
    credentials: this.#formBuilder.control({
      auth_type: ApiProviderAuthType.NONE
    }),
    tags: this.#formBuilder.control(null),
    privacyPolicy: this.#formBuilder.control(null),
    customDisclaimer: this.#formBuilder.control(null),

    options: this.#formBuilder.group({
      // Whether dynamically loaded tools are disabled by default
      disableToolDefault: this.#fb.control(null),
      needSandbox: this.#fb.control(false)
    })
  })
  // Outputs
  readonly valueChange = outputFromObservable(this.formGroup.valueChanges)

  // States
  readonly loading = signal(false)
  readonly url = model('')

  readonly isValid = toSignal(
    this.formGroup.valueChanges.pipe(
      combineLatestWith(this.refresh$),
      map(() => this.formGroup.valid)
    )
  )
  readonly inValid = toSignal(
    this.formGroup.valueChanges.pipe(
      combineLatestWith(this.refresh$),
      map(() => this.formGroup.invalid)
    )
  )
  readonly isDirty = toSignal(
    this.formGroup.valueChanges.pipe(
      combineLatestWith(this.refresh$),
      map(() => this.formGroup.dirty)
    )
  )

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
  get value() {
    return { ...this.formGroup.value } as unknown as Partial<IXpertToolset>
  }
  get tags() {
    return this.formGroup.get('tags') as FormControl
  }
  get options() {
    return this.formGroup.get('options') as FormGroup
  }
  get disableToolDefault() {
    return this.options.get('disableToolDefault') as FormControl
  }

  constructor() {
    super()

    effect(
      () => {
        this.loading() ? this.formGroup.disable() : this.formGroup.enable()
      },
      { allowSignalWrites: true }
    )

    effect(
      () => {
        if (this.cva.value$() && !this.formGroup.value.id && !isEqual(this.cva.value$(), this.formGroup.value)) {
          this.formGroup.patchValue({
            ...pick(
              this.cva.value$(),
              'id',
              'name',
              'avatar',
              'description',
              'options',
              'category',
              'tags',
              'privacyPolicy',
              'customDisclaimer'
            ),
          } as any)
          this.#cdr.detectChanges()
        }
      },
      { allowSignalWrites: true }
    )
  }
}
