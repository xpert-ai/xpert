import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  Injector,
  input,
  OnInit,
  signal,
  viewChild
} from '@angular/core'
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop'
import { FormControl, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import {
  genXpertMiddlewareKey,
  isMiddlewareToolEnabled,
  isUserAddableAgentMiddleware,
  IWFNMiddleware,
  SKILLS_MIDDLEWARE_NAME,
  TAgentMiddlewareDescriptor,
  WorkflowNodeTypeEnum
} from '@xpert-ai/contracts'
import {
  myRxResource,
  XpI18nPipe,
  ZardButtonComponent,
  ZardInputDirective,
  ZardSelectImports,
  ZardSelectValue,
  ZardSwitchComponent
} from '@xpert-ai/headless-ui'
import { firstValueFrom, of } from 'rxjs'
import { isEqual } from 'lodash-es'
import { getErrorMessage, XpertAgentService, XpertAPIService } from '@cloud/app/@core'
import { JSONSchemaFormComponent } from '@cloud/app/@shared/forms'
import { JsonSchemaWidgetStrategyRegistry } from '../../forms/json-schema-property/json-schema-widget-registry.service'
import { provideJsonSchemaWidgets } from '../json-schema-widgets'
import { delegationAgents } from './settings-delegation.utils'
import {
  assignedMiddlewares,
  removeMiddleware,
  saveMiddleware,
  SettingsMiddlewareNode
} from './settings-middleware.utils'
import { XpertSettingsEditor } from './xpert-settings.editor'

@Component({
  selector: 'xp-settings-middleware',
  standalone: true,
  providers: [JsonSchemaWidgetStrategyRegistry, ...provideJsonSchemaWidgets()],
  imports: [
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    XpI18nPipe,
    ZardButtonComponent,
    ZardInputDirective,
    ...ZardSelectImports,
    ZardSwitchComponent,
    JSONSchemaFormComponent
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './settings-middleware.component.html'
})
export class SettingsMiddlewareComponent implements OnInit {
  readonly mode = input<'skills' | 'middleware'>('middleware')
  readonly editor = inject(XpertSettingsEditor)
  private readonly api = inject(XpertAgentService)
  private readonly xpertApi = inject(XpertAPIService)
  private readonly translate = inject(TranslateService)
  private readonly injector = inject(Injector)
  private readonly language = toSignal(this.translate.onLangChange)
  private readonly i18n = new XpI18nPipe()
  readonly targetKey = signal(this.editor.source.draft().team.agent?.key ?? '')
  readonly agents = computed(() => delegationAgents(this.editor.source.draft()))
  readonly loading = signal(false)
  readonly loadError = signal<string | null>(null)
  readonly error = signal<string | null>(null)
  readonly catalog = signal<TAgentMiddlewareDescriptor[]>([])
  readonly providerChoice = signal('')
  readonly query = signal('')
  readonly selectedKey = signal<string | null>(null)
  readonly pendingRemoval = signal<SettingsMiddlewareNode | null>(null)
  readonly revision = signal(0)
  readonly schemaForm = viewChild(JSONSchemaFormComponent)
  readonly configuration = viewChild<ElementRef<HTMLFormElement>>('configuration')
  readonly titleInput = viewChild<ElementRef<HTMLInputElement>>('titleInput')
  readonly form = new FormGroup({
    title: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(100), Validators.pattern(/\S/)]
    }),
    provider: new FormControl('', { nonNullable: true, validators: Validators.required }),
    required: new FormControl(true, { nonNullable: true }),
    options: new FormControl<Record<string, unknown>>({}, { nonNullable: true }),
    tools: new FormControl<NonNullable<IWFNMiddleware['tools']>>({}, { nonNullable: true })
  })
  private initial = this.form.getRawValue()
  readonly dirty = computed(() => {
    this.revision()
    return (
      !!this.selectedKey() &&
      (!this.assigned().some((node) => node.key === this.selectedKey()) ||
        !isEqual(this.initial, this.form.getRawValue()))
    )
  })
  readonly assigned = computed(() =>
    assignedMiddlewares(this.editor.source.draft(), this.targetKey()).filter(
      (node) => (node.entity.provider === SKILLS_MIDDLEWARE_NAME) === (this.mode() === 'skills')
    )
  )
  readonly visible = computed(() => {
    this.language()
    const query = this.query().trim().toLocaleLowerCase()
    return this.assigned().filter(
      (node) =>
        !query ||
        [node.entity.title, node.entity.provider, this.i18n.transform(this.metadata(node.entity.provider)?.label)]
          .join(' ')
          .toLocaleLowerCase()
          .includes(query)
    )
  })
  readonly choices = computed(() =>
    this.catalog().filter(
      ({ meta }) =>
        isUserAddableAgentMiddleware(meta) && (meta.name === SKILLS_MIDDLEWARE_NAME) === (this.mode() === 'skills')
    )
  )
  readonly meta = computed(() => {
    this.revision()
    return this.catalog().find(({ meta }) => meta.name === this.form.controls.provider.value)?.meta
  })
  readonly canAdd = computed(
    () =>
      !!this.targetKey() &&
      !!this.providerChoice() &&
      !this.loading() &&
      !this.loadError() &&
      !this.dirty() &&
      !this.editor.source.saving() &&
      (this.mode() !== 'skills' || !this.assigned().length)
  )
  readonly formContext = computed(() => ({
    draft: this.editor.source.draft(),
    entity: {
      key: this.selectedKey(),
      type: WorkflowNodeTypeEnum.MIDDLEWARE,
      ...this.formValue()
    },
    xpertId: this.editor.source.id,
    workspaceId: this.editor.source.draft().team.workspaceId
  }))
  readonly sharedWith = computed(() =>
    this.agents()
      .filter(
        (agent) =>
          agent.key !== this.targetKey() &&
          assignedMiddlewares(this.editor.source.draft(), agent.key).some((node) => node.key === this.selectedKey())
      )
      .map((agent) => agent.entity.title || agent.entity.name || agent.key)
      .join(', ')
  )
  readonly toolsResource = myRxResource({
    request: () =>
      this.selectedKey() && this.meta()
        ? {
            provider: this.formValue().provider,
            options: this.formValue().options,
            xpertId: this.editor.source.id
          }
        : null,
    loader: ({ request }) =>
      request ? this.api.getAgentMiddleware(request.provider, request.options, request.xpertId) : of(null),
    options: { debounceTime: 500, equal: isEqual }
  })
  readonly variablesResource = myRxResource({
    request: () =>
      this.selectedKey()
        ? {
            xpertId: this.editor.source.id,
            agentKey: this.targetKey(),
            isDraft: true,
            environmentId: this.editor.source.draft().team.environmentId,
            connections: this.editor.source.draft().connections.map((edge) => edge.key)
          }
        : null,
    loader: ({ request }) => (request ? this.xpertApi.getNodeVariables(request) : of(null)),
    options: { equal: isEqual }
  })

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.revision.update((value) => value + 1))
  }
  ngOnInit() {
    void this.load()
  }
  metadata(provider: string) {
    return this.catalog().find(({ meta }) => meta.name === provider)?.meta
  }
  private formValue() {
    this.revision()
    return this.form.getRawValue()
  }
  async load() {
    if (this.loading()) return
    this.loading.set(true)
    this.loadError.set(null)
    try {
      this.catalog.set(await firstValueFrom(this.api.getAgentMiddlewareStrategies()))
      if (!this.choices().some(({ meta }) => meta.name === this.providerChoice())) {
        this.providerChoice.set(this.choices()[0]?.meta.name ?? '')
      }
      if (this.selectedKey()) this.toolsResource.reload()
    } catch (error) {
      this.loadError.set(getErrorMessage(error))
    } finally {
      this.loading.set(false)
    }
  }
  selectTarget(value: ZardSelectValue | ZardSelectValue[]) {
    if (
      this.dirty() ||
      this.editor.source.saving() ||
      typeof value !== 'string' ||
      !this.agents().some((agent) => agent.key === value)
    )
      return
    this.targetKey.set(value)
    this.selectedKey.set(null)
    this.pendingRemoval.set(null)
    this.error.set(null)
  }
  selectProvider(value: ZardSelectValue | ZardSelectValue[]) {
    if (typeof value === 'string') this.providerChoice.set(value)
  }
  edit(node?: SettingsMiddlewareNode) {
    if (this.dirty() || this.editor.source.saving() || (!node && !this.canAdd())) return
    this.selectedKey.set(node?.key ?? genXpertMiddlewareKey())
    this.form.reset({
      title: node?.entity.title || node?.entity.provider || this.providerChoice(),
      provider: node?.entity.provider ?? this.providerChoice(),
      required: node?.entity.required ?? !node,
      options: structuredClone(node?.entity.options ?? {}),
      tools: structuredClone(node?.entity.tools ?? {})
    })
    this.initial = structuredClone(this.form.getRawValue())
    this.revision.update((value) => value + 1)
    this.error.set(null)
    this.pendingRemoval.set(null)
    afterNextRender(
      () => {
        this.configuration()?.nativeElement.scrollIntoView({ block: 'start' })
        this.titleInput()?.nativeElement.focus({ preventScroll: true })
      },
      { injector: this.injector }
    )
  }
  reset() {
    this.form.reset(structuredClone(this.initial))
    this.selectedKey.set(null)
    this.error.set(null)
  }
  toolEnabled(name: string) {
    return isMiddlewareToolEnabled(this.form.controls.tools.value[name])
  }
  setToolEnabled(name: string, enabled: boolean) {
    const tools = this.form.controls.tools.value
    const config = tools[name]
    this.form.controls.tools.setValue({ ...tools, [name]: { ...(typeof config === 'object' ? config : {}), enabled } })
  }
  async save() {
    const key = this.selectedKey()
    if (!key) return this.editor.save()
    const isNew = !this.assigned().some((node) => node.key === key)
    if (!this.dirty() && !isNew) return this.editor.save()
    this.form.markAllAsTouched()
    if (this.form.invalid || !this.meta() || this.schemaForm()?.invalid) {
      this.error.set(this.translate.instant('XP.XpertSettings.Middleware.InvalidConfiguration'))
      return false
    }
    try {
      this.editor.source.update((draft) => saveMiddleware(draft, this.targetKey(), key, this.form.getRawValue()))
      this.initial = structuredClone(this.form.getRawValue())
      this.revision.update((value) => value + 1)
      this.error.set(null)
      return await this.editor.save()
    } catch (error) {
      this.error.set(this.translate.instant(getErrorMessage(error)))
      return false
    }
  }
  async remove() {
    const node = this.pendingRemoval()
    if (!node || this.dirty() || this.editor.source.saving()) return
    try {
      this.editor.source.update((draft) => removeMiddleware(draft, this.targetKey(), node.key))
      if (this.selectedKey() === node.key) this.reset()
      this.pendingRemoval.set(null)
      this.error.set(null)
      await this.editor.save()
    } catch (error) {
      this.error.set(this.translate.instant(getErrorMessage(error)))
    }
  }
}
