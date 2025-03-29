import { Dialog, DialogModule } from '@angular/cdk/dialog'
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
  signal
} from '@angular/core'
import { outputFromObservable } from '@angular/core/rxjs-interop'
import {
  FormArray,
  FormBuilder,
  FormControl,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
  Validators
} from '@angular/forms'
import { MatSlideToggleModule } from '@angular/material/slide-toggle'
import { routeAnimations } from '@metad/core'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { NgmDensityDirective } from '@metad/ocap-angular/core'
import { pick } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import {
  ApiProviderAuthType,
  getErrorMessage,
  IXpertToolset,
  TagCategoryEnum,
  ToastrService,
  XpertToolsetCategoryEnum,
  XpertToolsetService,
  XpertToolType
} from 'apps/cloud/src/app/@core'
import { EmojiAvatarComponent } from 'apps/cloud/src/app/@shared/avatar'
import { TagSelectComponent } from 'apps/cloud/src/app/@shared/tag'
import { XpertConfigureToolComponent } from '../../api-tool/types'
import { XpertToolAuthorizationInputComponent } from '../../authorization'
import { XpertMCPToolsComponent } from '../tools/tools.component'
import { Samples } from '../types'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    CdkMenuModule,
    DialogModule,
    TranslateModule,
    MatSlideToggleModule,

    EmojiAvatarComponent,
    TagSelectComponent,
    NgmSpinComponent,
    NgmDensityDirective,

    XpertToolAuthorizationInputComponent,
    XpertMCPToolsComponent
  ],
  selector: 'xpert-tool-mcp-configure',
  templateUrl: './configure.component.html',
  styleUrl: 'configure.component.scss',
  animations: [routeAnimations],
  changeDetection: ChangeDetectionStrategy.OnPush,
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
  readonly #dialog = inject(Dialog)
  readonly #cdr = inject(ChangeDetectorRef)
  readonly #fb = inject(FormBuilder)

  // Inputs
  readonly toolset = input<IXpertToolset>(null)

  readonly formGroup = new FormGroup({
    id: this.#formBuilder.control(null),
    name: new FormControl(null, [Validators.required]),
    avatar: new FormControl(null),
    description: new FormControl(null),
    schema: new FormControl<string>(null, [Validators.required]),
    type: this.#formBuilder.control('sse'),
    category: this.#formBuilder.control(XpertToolsetCategoryEnum.MCP),
    tools: new FormControl([]),
    credentials: this.#formBuilder.control({
      auth_type: ApiProviderAuthType.NONE
    }),
    tags: this.#formBuilder.control(null),
    privacyPolicy: this.#formBuilder.control(null),
    customDisclaimer: this.#formBuilder.control(null),

    options: this.#formBuilder.group({
      baseUrl: this.#fb.control(''),
      // Whether dynamically loaded tools are disabled by default
      disableToolDefault: this.#fb.control('')
    })
  })
  // Outputs
  readonly valueChange = outputFromObservable(this.formGroup.valueChanges)

  // States
  readonly loading = signal(false)
  readonly url = model('')

  isValid() {
    return this.formGroup.valid
  }
  isDirty() {
    return this.formGroup.dirty
  }

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
    return { ...this.formGroup.value } as unknown as Partial<IXpertToolset>
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

  addTool(toolSchema: XpertToolType) {
    const tools = this.tools.value
    tools.push({
      ...toolSchema,
      disabled: null
    })
    this.tools.setValue([...tools])
  }

  setSample() {
    this.schema.setValue(JSON.stringify(Samples, null, 2))
    // this.getMetadata()
  }

  // Get Metadata
  getMetadata() {
    this.loading.set(true)
    const schema = JSON.parse(this.schema.value)
    this.toolsetService.getMCPToolsBySchema({ servers: schema }).subscribe({
      next: (result) => {
        this.loading.set(false)
        result.tools.forEach((tool) => this.addTool(tool))
      },
      error: (err) => {
        this.#toastr.error(getErrorMessage(err))
        this.loading.set(false)
        // Handle the error scenario here
      }
    })
  }
}
