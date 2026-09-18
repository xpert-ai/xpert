import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  TemplateRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild
} from '@angular/core'
import { Dialog, DialogRef } from '@angular/cdk/dialog'
import { FormsModule } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import {
  parsePromptCapabilityConfig,
  parsePromptCapabilitySelection,
  resolvePromptWorkflowCapabilities
} from '@xpert-ai/contracts'
import {
  ZardButtonComponent,
  ZardCheckboxComponent,
  ZardIconComponent,
  ZardInputDirective,
  ZardSelectImports
} from '@xpert-ai/headless-ui'
import { firstValueFrom, take } from 'rxjs'
import { getErrorMessage, injectXpertAPI, XpertConnectorService } from '../../../../@core'
import type { PromptWorkflowExpert } from './expert-association-select.component'
import {
  changePromptCapability,
  connectorCapabilityOptions,
  restoreExpertCapabilityDefaults,
  runtimeCapabilityOptions,
  selectedCapabilities,
  type PromptCapabilityKind,
  type PromptCapabilityOption
} from './capability-selection'

type Catalog = { loading: boolean; options: PromptCapabilityOption[]; runtimeError?: string; connectorError?: string }

@Component({
  selector: 'xp-prompt-capability-select',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    TranslateModule,
    ZardButtonComponent,
    ZardCheckboxComponent,
    ZardIconComponent,
    ZardInputDirective,
    ...ZardSelectImports
  ],
  templateUrl: './capability-select.component.html',
  host: { class: 'block min-w-0' }
})
export class PromptCapabilitySelectComponent {
  readonly workspaceId = input.required<string>()
  readonly experts = input<PromptWorkflowExpert[]>([])
  readonly associatedXpertIds = input<string[]>([])
  readonly value = input<unknown>(null)
  readonly disabled = input(false)
  readonly valueChange = output<unknown>()
  readonly panel = viewChild.required<TemplateRef<unknown>>('panel')
  readonly kinds: Array<Exclude<PromptCapabilityKind, 'plugin'>> = ['skill', 'subAgent', 'connector']
  readonly kind = signal<Exclude<PromptCapabilityKind, 'plugin'>>('skill')
  readonly search = signal('')
  readonly expertId = signal('')
  readonly catalogs = signal<Map<string, Catalog>>(new Map())
  readonly eligibleExperts = computed(() =>
    this.experts().filter(
      (expert) => !this.associatedXpertIds().length || this.associatedXpertIds().includes(expert.id)
    )
  )
  readonly scoped = computed(() => parsePromptCapabilityConfig(this.value()))
  readonly legacy = computed(() => parsePromptCapabilitySelection(this.value()))
  readonly unsupported = computed(() => this.value() != null && !this.scoped() && !this.legacy())
  readonly activeCatalog = computed(() => this.catalogs().get(this.expertId()))
  readonly activeSelection = computed(() =>
    selectedCapabilities(resolvePromptWorkflowCapabilities(this.value(), this.expertId()))
  )
  readonly visibleOptions = computed(() => {
    const query = this.search().trim().toLocaleLowerCase()
    return (this.activeCatalog()?.options ?? []).filter(
      (option) =>
        option.kind === this.kind() &&
        (!query || `${option.label} ${option.description ?? ''}`.toLocaleLowerCase().includes(query))
    )
  })
  readonly catalogError = computed(() =>
    this.kind() === 'connector' ? this.activeCatalog()?.connectorError : this.activeCatalog()?.runtimeError
  )
  readonly groups = computed(() => {
    const shared = this.scoped()?.defaults ?? this.legacy()
    return [...(shared ? [{ xpertId: '', selection: shared }] : []), ...(this.scoped()?.experts ?? [])].map(
      (entry) => ({ ...entry, items: selectedCapabilities(entry.selection) })
    )
  })
  readonly #xperts = injectXpertAPI()
  readonly #connectors = inject(XpertConnectorService)
  readonly #translate = inject(TranslateService)
  readonly #dialog = inject(Dialog)
  #ref: DialogRef<unknown> | null = null
  #generation = 0

  constructor() {
    effect(() => {
      this.workspaceId()
      untracked(() => {
        this.#generation++
        this.catalogs.set(new Map())
        this.close()
      })
    })
    effect(() => {
      const eligible = this.eligibleExperts()
      const configured = this.groups()
        .map((group) => group.xpertId)
        .filter(Boolean)
      untracked(() => {
        if (!eligible.some((expert) => expert.id === this.expertId())) this.expertId.set(eligible[0]?.id ?? '')
        for (const id of configured) if (eligible.some((expert) => expert.id === id)) void this.load(id)
      })
    })
    inject(DestroyRef).onDestroy(() => {
      this.#generation++
      this.close()
    })
  }

  expertName(id: string) {
    return (
      this.experts().find((expert) => expert.id === id)?.title ||
      this.experts().find((expert) => expert.id === id)?.name ||
      id
    )
  }
  optionLabel(xpertId: string, item: Pick<PromptCapabilityOption, 'kind' | 'id'>) {
    return (
      this.catalogs()
        .get(xpertId)
        ?.options.find((option) => option.kind === item.kind && option.id === item.id)?.label ?? item.id
    )
  }
  reason(xpertId: string, item: Pick<PromptCapabilityOption, 'kind' | 'id'>): string {
    if (!xpertId) return 'LegacyScope'
    if (!this.eligibleExperts().some((expert) => expert.id === xpertId)) return 'ExpertUnavailable'
    const catalog = this.catalogs().get(xpertId)
    if (!catalog || catalog.loading) return 'Loading'
    if (item.kind === 'connector' ? catalog.connectorError : catalog.runtimeError) return 'LoadFailed'
    const option = catalog.options.find((option) => option.kind === item.kind && option.id === item.id)
    return !option ? 'Missing' : (option.unavailable ?? '')
  }
  isSelected(option: PromptCapabilityOption) {
    return this.activeSelection().some((item) => item.kind === option.kind && item.id === option.id)
  }
  toggle(option: PromptCapabilityOption, selected: boolean) {
    if (
      this.disabled() ||
      !this.expertId() ||
      !this.eligibleExperts().some((expert) => expert.id === this.expertId()) ||
      (selected &&
        (option.kind === 'plugin' || option.unavailable || this.activeCatalog()?.loading || this.catalogError()))
    )
      return
    this.valueChange.emit(changePromptCapability(this.value(), this.expertId(), option, selected, this.workspaceId()))
  }
  remove(xpertId: string, option: Pick<PromptCapabilityOption, 'kind' | 'id'>) {
    if (!this.disabled())
      this.valueChange.emit(changePromptCapability(this.value(), xpertId, option, false, this.workspaceId()))
  }
  restore(xpertId: string) {
    if (!this.disabled()) this.valueChange.emit(restoreExpertCapabilityDefaults(this.value(), xpertId))
  }
  reset() {
    if (!this.disabled()) this.valueChange.emit(null)
  }
  open() {
    if (this.disabled() || this.unsupported()) return
    this.search.set('')
    this.#ref = this.#dialog.open(this.panel(), {
      backdropClass: 'backdrop-blur-xs-black',
      panelClass: 'xp-overlay-pane-dialog',
      maxWidth: '95vw',
      maxHeight: '90vh',
      ariaLabel: this.#translate.instant('XP.PromptWorkflow.Capabilities.Add')
    })
    if (this.expertId()) void this.load(this.expertId())
  }
  close() {
    this.#ref?.close()
    this.#ref = null
  }
  selectExpert(id: string) {
    this.expertId.set(id)
    this.search.set('')
    void this.load(id)
  }
  async load(id: string, retry = false) {
    if (!id || (!retry && this.catalogs().has(id))) return
    const generation = this.#generation
    this.catalogs.update((items) => new Map(items).set(id, { loading: true, options: [] }))
    const [runtime, connectors] = await Promise.allSettled([
      firstValueFrom(this.#xperts.getRuntimeCapabilities(id).pipe(take(1))),
      firstValueFrom(this.#connectors.runtimeOptions(id).pipe(take(1)))
    ])
    if (generation !== this.#generation) return
    this.catalogs.update((items) =>
      new Map(items).set(id, {
        loading: false,
        options: [
          ...(runtime.status === 'fulfilled' ? runtimeCapabilityOptions(runtime.value) : []),
          ...(connectors.status === 'fulfilled'
            ? connectorCapabilityOptions(connectors.value, this.#translate.currentLang)
            : [])
        ],
        ...(runtime.status === 'rejected' ? { runtimeError: getErrorMessage(runtime.reason) } : {}),
        ...(connectors.status === 'rejected' ? { connectorError: getErrorMessage(connectors.reason) } : {})
      })
    )
  }
}
