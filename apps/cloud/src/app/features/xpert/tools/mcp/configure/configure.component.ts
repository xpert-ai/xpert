import { Dialog, DialogModule } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  effect,
  inject,
  input,
  model,
  signal,
  output
} from '@angular/core'
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
import { MatSlideToggleModule } from '@angular/material/slide-toggle'
import { routeAnimations } from '@metad/core'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { NgmDensityDirective } from '@metad/ocap-angular/core'
import { pick } from '@metad/ocap-core'
import { TranslateModule } from '@ngx-translate/core'
import {
  ApiProviderAuthType,
  getErrorMessage,
  IXpertTool,
  IXpertToolset,
  MCPServerTransport,
  TagCategoryEnum,
  TMCPSchema,
  ToastrService,
  XpertToolsetCategoryEnum,
  XpertToolsetService,
  XpertToolType
} from 'apps/cloud/src/app/@core'
import { EmojiAvatarComponent } from 'apps/cloud/src/app/@shared/avatar'
import { TagSelectComponent } from 'apps/cloud/src/app/@shared/tag'
import { XpertConfigureToolComponent } from '../../api-tool/types'
import { XpertMCPToolsComponent } from '../tools/tools.component'
import { Samples } from '../types'
import { combineLatestWith, map } from 'rxjs/operators'
import { CdkListboxModule } from '@angular/cdk/listbox'
import { FileEditorComponent } from 'apps/cloud/src/app/@shared/files'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    CdkMenuModule,
    DialogModule,
    CdkListboxModule,
    TranslateModule,
    MatSlideToggleModule,

    EmojiAvatarComponent,
    TagSelectComponent,
    NgmSpinComponent,
    NgmDensityDirective,
    FileEditorComponent,
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
    avatar: new FormControl({
      url: '/assets/icons/mcp.png'
    }),
    description: new FormControl(null),
    schema: new FormControl<string>(null, [Validators.required]),
    type: this.#formBuilder.control('sse'),
    types: this.#formBuilder.control(['sse']),
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
      disableToolDefault: this.#fb.control(''),
      needSandbox: this.#fb.control(false),
    })
  })
  // Outputs
  readonly valueChange = outputFromObservable(this.formGroup.valueChanges)
  readonly toolsChange = output<IXpertTool[]>()

  // States
  readonly loading = signal(false)
  readonly url = model('')

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
  get types() {
    return this.formGroup.get('types') as FormControl
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
  get needSandbox() {
    return this.options.get('needSandbox') as FormControl
  }
  get _schema() {
    return this.schema.value
  }
  set _schema(value) {
    this.schema.setValue(value)
  }


  readonly #schema = signal<{schema: TMCPSchema; error?: string;}>(null)
  readonly error = computed(() => this.#schema()?.error)

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
    const schema = this.schema.value
    // const schema = JSON.parse(this.schema.value) as TMCPSchema
    // const servers = schema.mcpServers ?? schema.servers
    this.toolsetService.getMCPToolsBySchema(schema).subscribe({
      next: (result) => {
        this.loading.set(false)
        result.tools.forEach((tool) => this.addTool(tool))
        // this.needSandbox.setValue(Object.values(servers).some((server) => server.transport === MCPServerTransport.STDIO || server.command))
        this.toolsChange.emit(result.tools)
      },
      error: (err) => {
        this.#toastr.error(getErrorMessage(err))
        this.loading.set(false)
        // Handle the error scenario here
      }
    })
  }

  onBlur() {
    const value = this.schema.value?.trim()
    if (value) {
      try {
        this.#schema.set({schema: JSON.parse(value)})
        this.schema.setValue(this.#schema()?.schema ? JSON.stringify(this.#schema().schema, null, 4) : '')
      } catch(err) {
        this.#schema.set({error: getErrorMessage(err), schema: null})
      }
    }
  }
}
