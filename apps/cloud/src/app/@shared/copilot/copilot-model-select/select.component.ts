import { CdkMenuModule, CdkMenuTrigger } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import {
  afterNextRender,
  booleanAttribute,
  ChangeDetectorRef,
  Component,
  computed,
  DestroyRef,
  effect,
  forwardRef,
  inject,
  input,
  model,
  signal,
  viewChildren
} from '@angular/core'
import { toObservable } from '@angular/core/rxjs-interop'
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR, ReactiveFormsModule } from '@angular/forms'
import { XpDialogControlDirective, XpHighlightDirective } from '@xpert-ai/headless-ui'
import { debouncedSignal, myRxResource, XpI18nPipe, nonBlank } from '@xpert-ai/headless-ui'
import { TranslateModule } from '@ngx-translate/core'
import { map, of } from 'rxjs'
import {
  AiModelTypeEnum,
  ModelFeature,
  ModelPropertyKey,
  normalizeModelParameterValue,
  resolveModelParameterOptions
} from '@xpert-ai/contracts'
import type {
  I18nObject,
  ICopilot,
  ICopilotModel,
  ICopilotWithProvider,
  ParameterRule,
  ProviderModel,
  TCopilotModelOptions
} from '@xpert-ai/contracts'
import { injectCopilotProviderService } from '../../../@core/services/copilot-provider.service'
import { CopilotServerService } from '../../../@core/services/copilot-server.service'
import { ModelParameterInputComponent } from '../model-parameter-input/input.component'
import { ZardTabsImports, ZardTooltipImports } from '@xpert-ai/headless-ui'
import { ZardAlertComponent, ZardButtonComponent, ZardSearchInputComponent } from '@xpert-ai/headless-ui'
import { ModelFilterTag, providerModelDisplayTags, providerModelFilterTags } from '../model-tags'

type ModelParameterRulesResourceValue = {
  model: string | undefined
  modelType: AiModelTypeEnum | undefined
  providerId: string | undefined
  rules: ParameterRule[]
}

const MODEL_MENU_MAX_HEIGHT = 560
const MODEL_MENU_VIEWPORT_MARGIN = 16
const MODEL_MENU_TRIGGER_GAP = 8
const MODEL_INLINE_TAGS_MIN_WIDTH = 720
const SELECTED_MODEL_INLINE_TAGS_MIN_WIDTH = 520

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    CdkMenuModule,
    ...ZardTabsImports,
    ...ZardTooltipImports,
    XpI18nPipe,
    XpHighlightDirective,
    XpDialogControlDirective,
    ModelParameterInputComponent,
    ZardAlertComponent,
    ZardButtonComponent,
    ZardSearchInputComponent
  ],
  selector: 'copilot-model-select',
  templateUrl: 'select.component.html',
  styleUrls: ['select.component.scss'],
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => CopilotModelSelectComponent), multi: true }],
  host: {
    '[class.readonly]': 'interactionDisabled()',
    '[class.status-choose]': 'statusChoose()'
  }
})
export class CopilotModelSelectComponent implements ControlValueAccessor {
  readonly value$ = signal<ICopilotModel | null>(null)
  readonly disabled = signal(false)
  readonly copilotServer = inject(CopilotServerService)
  readonly copilotProviderService = injectCopilotProviderService()
  readonly i18n = new XpI18nPipe()
  readonly #cdr = inject(ChangeDetectorRef)
  readonly #destroyRef = inject(DestroyRef)

  // Inputs
  readonly modelType = input<AiModelTypeEnum>()
  readonly features = input<ModelFeature[]>()
  /** Undefined uses the shared catalog; an empty list allows no models. */
  readonly allowedModels = input<ReadonlyArray<Pick<ICopilotModel, 'copilotId' | 'model' | 'modelType'>>>()
  readonly showParameters = input(true, { transform: booleanAttribute })
  readonly inheritModel = input<ICopilotModel>()
  readonly copilotModel = input<ICopilotModel>()

  readonly copilot = input<ICopilot>()

  readonly readonly = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })

  readonly hiddenLabel = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })
  readonly required = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })
  readonly clearable = input<boolean, boolean | string>(true, {
    transform: booleanAttribute
  })

  readonly label = input<string | I18nObject>()

  readonly modelDisplayTags = providerModelDisplayTags
  readonly interactionDisabled = computed(() => this.readonly() || this.disabled())
  private readonly menuTriggers = viewChildren(CdkMenuTrigger)

  // States
  readonly __copilotModel = computed(() => this.value$() ?? this.copilotModel())
  readonly _copilotModel = computed(() => this.__copilotModel() ?? this.inheritModel())

  readonly modelCatalog = myRxResource({
    request: () => ({ type: this.modelType() }),
    loader: ({ request }) => this.copilotServer.getCopilotModels(request.type)
  })
  readonly copilotWithModels = computed(() => {
    const copilot = this.copilot()
    return this.modelCatalog
      .value()
      ?.filter((item) => !copilot || item.id === copilot.id)
      .map((item) => ({
        ...item,
        providerWithModels: {
          ...item.providerWithModels,
          models: item.providerWithModels.models.filter((model) =>
            this.isAllowedModel({ copilotId: item.id, model: model.model, modelType: model.model_type })
          )
        }
      }))
      .filter((item) => item.providerWithModels.models.length)
      .sort((a, b) => {
        const roleOrder = { primary: 0, secondary: 1, embedding: 2 }
        return roleOrder[a.role] - roleOrder[b.role]
      })
  })
  readonly copilotWithModels$ = toObservable(this.copilotWithModels)

  readonly searchTerm = model('')
  readonly activeCopilotTabId = model<string | null>(null)
  readonly railWidth = model<number | null>(null)
  readonly isRailResizing = signal(false)
  readonly selectedModelFilterIds = signal<string[]>([])
  readonly #searchTerm = debouncedSignal(this.searchTerm, 300)
  readonly featureFilteredCopilots = computed(() => {
    const features = this.features()
    return features?.length
      ? this.copilotWithModels()
          ?.map((_) => {
            return {
              ..._,
              providerWithModels: {
                ..._.providerWithModels,
                models: _.providerWithModels.models.filter((m) =>
                  features.every((feature) => m.features?.includes(feature))
                )
              }
            }
          })
          .filter((_) => _.providerWithModels.models.length)
      : this.copilotWithModels()
  })

  readonly searchedModels = computed(() => {
    const searchText = this.#searchTerm().trim().toLowerCase()
    const copilots = this.featureFilteredCopilots()

    return searchText
      ? copilots
          ?.map((_) => {
            const models = _.providerWithModels.models.filter((m) => m.model.toLowerCase().includes(searchText))
            if (models.length) {
              return {
                ..._,
                providerWithModels: {
                  ..._.providerWithModels,
                  models
                }
              }
            }
            if (
              this.i18n.transform(_.providerWithModels.label)?.toLowerCase().includes(searchText) ||
              _.name?.toLowerCase().includes(searchText)
            ) {
              return _
            }
            return null
          })
          .filter(nonBlank)
      : copilots
  })

  readonly activeSearchedCopilot = computed(() => {
    const activeCopilotTabId = this.resolvedActiveCopilotTabId()
    return activeCopilotTabId
      ? (this.searchedModels()?.find((copilot) => copilot.id === activeCopilotTabId) ?? null)
      : null
  })

  readonly activeModelFilterTags = computed(() => {
    const tags = new Map<string, ModelFilterTag>()
    for (const model of this.activeSearchedCopilot()?.providerWithModels.models ?? []) {
      for (const tag of this.getModelFilterTags(model)) {
        if (!tags.has(tag.id)) {
          tags.set(tag.id, tag)
        }
      }
    }
    return Array.from(tags.values())
  })

  readonly selectedModelFilters = computed(() => {
    const selectedIds = new Set(this.selectedModelFilterIds())
    return this.activeModelFilterTags().filter((tag) => selectedIds.has(tag.id))
  })

  readonly modelFilterTags = computed(() => {
    return this.activeModelFilterTags()
  })
  readonly activeCopilotTabIndex = computed(() => {
    const copilots = this.searchedModels() ?? []
    const activeCopilotTabId = this.resolvedActiveCopilotTabId()

    if (!copilots.length || !activeCopilotTabId) {
      return 0
    }

    const index = copilots.findIndex((copilot) => copilot.id === activeCopilotTabId)
    return index > -1 ? index : 0
  })
  readonly resolvedActiveCopilotTabId = computed(() => {
    const copilots = this.searchedModels() ?? []
    if (!copilots.length) {
      return null
    }

    const activeCopilotTabId = this.activeCopilotTabId()
    if (activeCopilotTabId && copilots.some((copilot) => copilot.id === activeCopilotTabId)) {
      return activeCopilotTabId
    }

    const currentCopilotId = this.copilotId()
    if (currentCopilotId && copilots.some((copilot) => copilot.id === currentCopilotId)) {
      return currentCopilotId
    }

    return copilots[0].id
  })

  readonly copilotId = computed(() => this._copilotModel()?.copilotId)
  readonly selectedCopilotWithModels = computed(() => {
    return this.copilotWithModels()?.find((_) => _.id === this.copilotId())
  })

  readonly providerId = computed(() => this.selectedCopilotWithModels()?.modelProvider?.id)

  readonly model = computed(() => this._copilotModel()?.model)

  readonly selectedAiModel = computed(() =>
    this.selectedCopilotWithModels()?.providerWithModels?.models?.find(
      (_) => _.model === this.model() && (this.modelType() ? _.model_type === this.modelType() : true)
    )
  )

  readonly #modelParameterRules = myRxResource({
    request: () => ({
      providerId: this.showParameters() && this.selectedAiModel() ? this.providerId() : undefined,
      modelType: this.modelType(),
      model: this.model()
    }),
    loader: ({ request }) =>
      request.providerId && request.modelType && request.model
        ? this.copilotProviderService.getModelParameterRules(request.providerId, request.modelType, request.model).pipe(
            map(
              (rules): ModelParameterRulesResourceValue => ({
                ...request,
                rules
              })
            )
          )
        : of({
            ...request,
            rules: []
          } satisfies ModelParameterRulesResourceValue)
  })
  readonly modelParameterRulesError = computed(() =>
    this.#modelParameterRules.status() === 'error' ? this.#modelParameterRules.error() : null
  )
  readonly modelParameterRules = computed(() =>
    this.modelParameterRulesError() ? [] : (this.#modelParameterRules.value()?.rules ?? [])
  )
  readonly hasResolvedCurrentModelParameterRules = computed(() => {
    if (this.#modelParameterRules.status() !== 'success') {
      return false
    }

    const resource = this.#modelParameterRules.value()
    return (
      resource?.providerId === this.providerId() &&
      resource?.modelType === this.modelType() &&
      resource?.model === this.model()
    )
  })

  readonly isInherit = computed(() => !this.__copilotModel())
  readonly selectionUnavailable = computed(
    () => this.modelCatalog.status() === 'success' && !!this.model() && !this.selectedAiModel()
  )
  readonly statusChoose = computed(() => this.selectionUnavailable())

  onChange: ((value: ICopilotModel | null) => void) | null = null
  onTouched: (() => void) | null = null
  #railResizeAbortController: AbortController | null = null

  // @backcompatibility for change detection
  private filteredChangeSub = toObservable(this.searchedModels).subscribe(() => {
    setTimeout(() => {
      this.#cdr.detectChanges()
    }, 100)
  })

  toggleModelFilter(filterId: string) {
    this.selectedModelFilterIds.update((ids) =>
      ids.includes(filterId) ? ids.filter((id) => id !== filterId) : [...ids, filterId]
    )
  }

  clearModelFilters() {
    this.selectedModelFilterIds.set([])
  }

  isModelFilterSelected(filterId: string) {
    return this.selectedModelFilterIds().includes(filterId)
  }

  private getModelFilterTags(model: ProviderModel): ModelFilterTag[] {
    return providerModelFilterTags(model)
  }

  private matchesModelFilters(model: ProviderModel, filters: ModelFilterTag[]) {
    const modelTagIds = new Set(this.getModelFilterTags(model).map((tag) => tag.id))
    return filters.every((filter) => modelTagIds.has(filter.id))
  }

  constructor() {
    this.#destroyRef.onDestroy(() => this.stopRailResize())

    effect(() => {
      if (this.interactionDisabled()) {
        for (const trigger of this.menuTriggers()) trigger.close()
      }
    })

    effect(() => {
      const availableIds = new Set(this.modelFilterTags().map((tag) => tag.id))
      const selectedIds = this.selectedModelFilterIds()
      const nextSelectedIds = selectedIds.filter((id) => availableIds.has(id))
      if (nextSelectedIds.length !== selectedIds.length) {
        this.selectedModelFilterIds.set(nextSelectedIds)
      }
    })

    effect(() => {
      const value = this.value$()
      const rules = this.modelParameterRules()
      if (value && this.selectedAiModel() && this.hasResolvedCurrentModelParameterRules()) {
        const options = this.resolveOptions(value.options, rules)
        if (this.areOptionsEqual(value.options, options)) {
          return
        }
        this.commitValue({ ...value, options })
      }
    })

    afterNextRender(() => {
      setTimeout(() => {
        this.#cdr.detectChanges()
      }, 600)
    })
  }

  writeValue(obj: ICopilotModel | null): void {
    this.value$.set(obj)
  }
  registerOnChange(fn: (value: ICopilotModel | null) => void): void {
    this.onChange = fn
  }
  registerOnTouched(fn: () => void): void {
    this.onTouched = fn
  }
  setDisabledState?(isDisabled: boolean): void {
    this.disabled.set(isDisabled)
  }

  updateValue(value: ICopilotModel | null) {
    if (!this.interactionDisabled() && (!value || this.isAllowedModel(value))) {
      this.commitValue(value)
      this.onTouched?.()
    }
  }

  private commitValue(value: ICopilotModel | null) {
    this.value$.set(value)
    // Propagate user edits synchronously so an immediate Save sees the committed value.
    this.onChange?.(value)
  }

  private isAllowedModel(value: Pick<ICopilotModel, 'copilotId' | 'model' | 'modelType'>) {
    const allowed = this.allowedModels()
    return (
      allowed === undefined ||
      allowed.some(
        (item) => item.copilotId === value.copilotId && item.model === value.model && item.modelType === value.modelType
      )
    )
  }

  initModel(copilotId: string, model?: ProviderModel | null) {
    const effectiveModel = this._copilotModel()
    this.updateValue(
      this.withModelContextSize(
        {
          copilotId,
          model: model?.model ?? effectiveModel?.model ?? this.model(),
          modelType: this.modelType(),
          options: this.cloneOptions(effectiveModel?.options)
        },
        model
      )
    )
  }

  setModel(copilot: ICopilot, model: ProviderModel) {
    const currentValue = this.value$()
    const effectiveValue = currentValue ?? this._copilotModel()
    const nextModelType = this.modelType()
    const nValue = this.withModelContextSize(
      {
        options:
          effectiveValue?.copilotId === copilot.id &&
          effectiveValue?.model === model.model &&
          effectiveValue?.modelType === nextModelType
            ? this.cloneOptions(effectiveValue.options)
            : this.clientOptions(effectiveValue?.options),
        model: model.model,
        copilotId: copilot.id,
        modelType: nextModelType
      },
      model
    )
    this.updateValue(nValue)
  }

  getParameter(name: string) {
    return this._copilotModel()?.options?.[name]
  }

  updateParameter(name: string, value: unknown) {
    if (!this.value$()) {
      this.initModel(this.copilotId(), this.selectedAiModel())
    }
    const rule = this.hasResolvedCurrentModelParameterRules()
      ? this.modelParameterRules().find((item) => item.name === name)
      : null
    const nextValue = rule ? normalizeModelParameterValue(value, rule) : value

    this.updateValue({
      ...this.value$(),
      options: {
        ...(this.value$().options ?? {}),
        [name]: nextValue === undefined && rule && !rule.required ? null : nextValue
      }
    })
  }

  delete() {
    this.updateValue(null)
  }

  syncActiveCopilotTab() {
    const copilots = this.searchedModels() ?? []
    if (!copilots.length) {
      this.activeCopilotTabId.set(null)
      return
    }

    const currentCopilotId = this.copilotId()
    this.activeCopilotTabId.set(
      currentCopilotId && copilots.some((copilot) => copilot.id === currentCopilotId)
        ? currentCopilotId
        : copilots[0].id
    )
  }

  selectCopilotTabByIndex(index: number) {
    const copilot = this.searchedModels()?.[index]
    if (copilot) {
      if (copilot.id !== this.activeCopilotTabId()) {
        this.clearModelFilters()
      }
      this.activeCopilotTabId.set(copilot.id)
    }
  }

  getCopilotTabModelCount(copilot: ICopilotWithProvider) {
    return copilot.providerWithModels?.models?.length ?? 0
  }

  getVisibleCopilotModels(copilot: ICopilotWithProvider) {
    const models = copilot.providerWithModels?.models ?? []
    if (copilot.id !== this.resolvedActiveCopilotTabId()) {
      return models
    }

    const filters = this.selectedModelFilters()
    return filters.length ? models.filter((model) => this.matchesModelFilters(model, filters)) : models
  }

  showInlineModelTags(menuWidth: number | null | undefined, menuRailWidth: number | null | undefined) {
    return (menuWidth ?? 0) - (menuRailWidth ?? 0) >= MODEL_INLINE_TAGS_MIN_WIDTH
  }

  showInlineSelectedModelTags(container: HTMLElement | null | undefined) {
    return (container?.getBoundingClientRect().width ?? 0) >= SELECTED_MODEL_INLINE_TAGS_MIN_WIDTH
  }

  getMenuWidth(container: HTMLElement | null | undefined) {
    const viewportWidth = this.getViewportRect()?.width ?? 1024
    return Math.min(
      Math.max(container?.getBoundingClientRect().width ?? 0, 520),
      viewportWidth - MODEL_MENU_VIEWPORT_MARGIN * 2
    )
  }

  getMenuMaxHeight(container: HTMLElement | null | undefined) {
    const viewportRect = this.getViewportRect()
    if (!container || !viewportRect) {
      return MODEL_MENU_MAX_HEIGHT
    }

    const rect = container.getBoundingClientRect()
    const availableAbove = rect.top - viewportRect.top - MODEL_MENU_TRIGGER_GAP - MODEL_MENU_VIEWPORT_MARGIN
    const availableBelow = viewportRect.bottom - rect.bottom - MODEL_MENU_TRIGGER_GAP - MODEL_MENU_VIEWPORT_MARGIN
    const availableHeight = Math.max(availableAbove, availableBelow)

    return Math.max(1, Math.floor(Math.min(MODEL_MENU_MAX_HEIGHT, availableHeight)))
  }

  getMenuRailMinWidth(containerWidth: number | null | undefined) {
    return this.getMenuRailBounds(containerWidth).min
  }

  getMenuRailMaxWidth(containerWidth: number | null | undefined) {
    return this.getMenuRailBounds(containerWidth).max
  }

  getMenuRailWidth(containerWidth: number | null | undefined) {
    const { defaultWidth } = this.getMenuRailBounds(containerWidth)
    const railWidth = this.railWidth()
    return this.clampRailWidth(typeof railWidth === 'number' ? railWidth : defaultWidth, containerWidth)
  }

  getMenuGridTemplateColumns(containerWidth: number | null | undefined) {
    return `${this.getMenuRailWidth(containerWidth)}px minmax(0, 1fr)`
  }

  startRailResize(event: MouseEvent, container: HTMLElement | null | undefined) {
    if (!container) {
      return
    }

    if ('button' in event && event.button !== 0) {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    const rect = container.getBoundingClientRect()
    this.stopRailResize()

    const abortController = new AbortController()
    this.#railResizeAbortController = abortController

    const updateWidth = (clientX: number) => {
      this.setRailWidth(clientX - rect.left, rect.width)
    }

    updateWidth(event.clientX)
    this.isRailResizing.set(true)
    document.body.classList.add('cursor-col-resize', 'select-none')

    const stopResize = () => this.stopRailResize()

    document.addEventListener('mousemove', (moveEvent) => updateWidth(moveEvent.clientX), {
      signal: abortController.signal
    })
    document.addEventListener('mouseup', stopResize, {
      once: true,
      signal: abortController.signal
    })
    window.addEventListener('blur', stopResize, {
      once: true,
      signal: abortController.signal
    })
  }

  onRailResizeKeydown(event: KeyboardEvent, container: HTMLElement | null | undefined) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    const containerWidth = this.getMenuWidth(container)
    const delta = event.key === 'ArrowLeft' ? -12 : 12
    this.setRailWidth(this.getMenuRailWidth(containerWidth) + delta, containerWidth)
  }

  private withModelContextSize(value: Partial<ICopilotModel>, model?: ProviderModel | null): ICopilotModel {
    const contextSize = this.parseContextSize(model?.model_properties?.[ModelPropertyKey.CONTEXT_SIZE])
    const options = {
      ...(value.options ?? {})
    }

    if (typeof contextSize === 'number') {
      options[ModelPropertyKey.CONTEXT_SIZE] = contextSize
    } else if (model) {
      delete options[ModelPropertyKey.CONTEXT_SIZE]
    }

    return {
      ...value,
      options: Object.keys(options).length ? options : undefined
    } as ICopilotModel
  }

  private parseContextSize(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return Math.floor(value)
    }
    if (typeof value === 'string') {
      const parsed = Number.parseInt(value, 10)
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed
      }
    }
    return undefined
  }

  private resolveOptions(options: TCopilotModelOptions | undefined, rules: ParameterRule[]) {
    const contextSize = this.parseContextSize(options?.[ModelPropertyKey.CONTEXT_SIZE])
    const retainedOptions: TCopilotModelOptions = {
      ...this.clientOptions(options),
      ...(typeof contextSize === 'number' ? { [ModelPropertyKey.CONTEXT_SIZE]: contextSize } : {})
    }

    for (const rule of rules) {
      if (!rule.name) {
        continue
      }

      if (Object.prototype.hasOwnProperty.call(options ?? {}, rule.name)) {
        retainedOptions[rule.name] = options?.[rule.name]
      }
    }

    return resolveModelParameterOptions(retainedOptions, rules, { preserveUnset: true })
  }

  private clientOptions(options?: TCopilotModelOptions): TCopilotModelOptions {
    return options?.maxRetries === undefined ? {} : { maxRetries: options.maxRetries }
  }

  private cloneOptions(options?: TCopilotModelOptions) {
    return options ? { ...options } : undefined
  }

  private areOptionsEqual(current: TCopilotModelOptions | undefined, next: TCopilotModelOptions | undefined) {
    const currentKeys = Object.keys(current ?? {})
    const nextKeys = Object.keys(next ?? {})

    if (currentKeys.length !== nextKeys.length) {
      return false
    }

    return currentKeys.every((key) => current?.[key] === next?.[key])
  }

  private getMenuRailBounds(containerWidth: number | null | undefined) {
    const min = 72
    const fallbackMax = 220
    const fallbackDefault = 88

    if (!containerWidth) {
      return {
        min,
        max: fallbackMax,
        defaultWidth: fallbackDefault
      }
    }

    const max = Math.max(min + 32, Math.min(fallbackMax, Math.floor(containerWidth - 220)))
    const defaultWidth = Math.min(max, Math.max(min, Math.floor(containerWidth * 0.13)))

    return {
      min,
      max,
      defaultWidth
    }
  }

  private clampRailWidth(width: number, containerWidth: number | null | undefined) {
    const { min, max } = this.getMenuRailBounds(containerWidth)
    return Math.min(max, Math.max(min, Math.floor(width)))
  }

  private setRailWidth(width: number, containerWidth: number | null | undefined) {
    this.railWidth.set(this.clampRailWidth(width, containerWidth))
  }

  private getViewportRect() {
    if (typeof window === 'undefined') {
      return null
    }

    const visualViewport = window.visualViewport
    const top = visualViewport?.offsetTop ?? 0
    const left = visualViewport?.offsetLeft ?? 0
    const width = visualViewport?.width ?? window.innerWidth
    const height = visualViewport?.height ?? window.innerHeight

    return {
      top,
      left,
      width,
      height,
      right: left + width,
      bottom: top + height
    }
  }

  private stopRailResize() {
    this.#railResizeAbortController?.abort()
    this.#railResizeAbortController = null
    this.isRailResizing.set(false)
    document.body.classList.remove('cursor-col-resize', 'select-none')
  }
}
