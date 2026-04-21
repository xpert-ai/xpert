import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import {
  afterNextRender,
  booleanAttribute,
  ChangeDetectorRef,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  model,
  signal
} from '@angular/core'
import { toObservable } from '@angular/core/rxjs-interop'
import { ControlValueAccessor, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { NgmHighlightDirective } from '@xpert-ai/ocap-angular/common'
import { debouncedSignal, myRxResource, NgmI18nPipe, nonBlank } from '@xpert-ai/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'
import { derivedAsync } from 'ngxtension/derived-async'
import { distinctUntilChanged, map, of } from 'rxjs'
import {
  AiModelTypeEnum,
  CopilotServerService,
  I18nObject,
  ICopilot,
  ICopilotModel,
  ICopilotWithProvider,
  injectCopilotProviderService,
  ModelPropertyKey,
  ModelFeature,
  ParameterType,
  ProviderModel
} from '../../../@core'
import { ModelParameterInputComponent } from '../model-parameter-input/input.component'
import { ZardTabsImports, ZardTooltipImports } from '@xpert-ai/headless-ui'
import { ZardAlertComponent } from '@xpert-ai/headless-ui/components/alert'

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
    NgmI18nPipe,
    NgmHighlightDirective,
    ModelParameterInputComponent,
    ZardAlertComponent
  ],
  selector: 'copilot-model-select',
  templateUrl: 'select.component.html',
  styleUrls: ['select.component.scss'],
  hostDirectives: [NgxControlValueAccessor],
  host: {
    '[class.readonly]': 'readonly()',
    '[class.status-choose]': 'statusChoose()'
  }
})
export class CopilotModelSelectComponent implements ControlValueAccessor {
  eModelFeature = ModelFeature
  eModelType = AiModelTypeEnum
  eParameterType = ParameterType

  protected cva = inject<NgxControlValueAccessor<Partial<ICopilotModel> | null>>(NgxControlValueAccessor)
  readonly copilotServer = inject(CopilotServerService)
  readonly copilotProviderService = injectCopilotProviderService()
  readonly i18n = new NgmI18nPipe()
  readonly #cdr = inject(ChangeDetectorRef)
  readonly #destroyRef = inject(DestroyRef)

  // Inputs
  readonly modelType = input<AiModelTypeEnum>()
  readonly features = input<ModelFeature[]>()
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

  readonly label = input<string | I18nObject>()

  // States
  readonly __copilotModel = computed(() => this.cva.value$() ?? this.copilotModel())
  readonly _copilotModel = computed(() => this.__copilotModel() ?? this.inheritModel())

  readonly copilotWithModels = derivedAsync(() => {
    const copilot = this.copilot()
    return this.copilotServer.getCopilotModels(this.modelType()).pipe(
      map((copilots) => {
        return copilots
          ?.filter((_) => (copilot ? _.id === copilot.id : true))
          .sort((a, b) => {
            const roleOrder = { primary: 0, secondary: 1, embedding: 2 }
            return roleOrder[a.role] - roleOrder[b.role]
          })
      })
    )
  })
  readonly copilotWithModels$ = toObservable(this.copilotWithModels)

  readonly searchTerm = model('')
  readonly activeCopilotTabId = model<string | null>(null)
  readonly railWidth = model<number | null>(null)
  readonly isRailResizing = signal(false)
  readonly #searchTerm = debouncedSignal(this.searchTerm, 300)
  readonly searchedModels = computed(() => {
    const searchText = this.#searchTerm().trim().toLowerCase()
    const copilots = this.features()?.length
      ? this.copilotWithModels()
          ?.map((_) => {
            return {
              ..._,
              providerWithModels: {
                ..._.providerWithModels,
                models: _.providerWithModels.models.filter((m) =>
                  this.features().every((feature) => m.features?.includes(feature))
                )
              }
            }
          })
          .filter((_) => _.providerWithModels.models.length)
      : this.copilotWithModels()

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
      providerId: this.providerId(),
      modelType: this.modelType(),
      model: this.model()
    }),
    loader: ({ request }) =>
      request.providerId && request.modelType && request.model
        ? this.copilotProviderService.getModelParameterRules(request.providerId, request.modelType, request.model)
        : of([])
  })
  readonly modelParameterRulesError = computed(() =>
    this.#modelParameterRules.status() === 'error' ? this.#modelParameterRules.error() : null
  )
  readonly modelParameterRules = computed(() =>
    this.modelParameterRulesError() ? [] : (this.#modelParameterRules.value() ?? [])
  )

  readonly isInherit = computed(() => !this.__copilotModel())
  readonly statusChoose = computed(() => !this.selectedCopilotWithModels() && !!this.__copilotModel())

  onChange: ((value: ICopilotModel | null) => void) | null = null
  onTouched: (() => void) | null = null
  #railResizeAbortController: AbortController | null = null
  private valueChangeSub = this.cva.valueChange.pipe(distinctUntilChanged()).subscribe((value) => {
    this.onChange?.(value)
  })

  // @backcompatibility for change detection
  private filteredChangeSub = toObservable(this.searchedModels).subscribe(() => {
    setTimeout(() => {
      this.#cdr.detectChanges()
    }, 100)
  })

  constructor() {
    this.#destroyRef.onDestroy(() => this.stopRailResize())

    effect(() => {
      const value = this.cva.value$()
      const rules = this.modelParameterRules()
      if (value && rules?.length && this.shouldInitDefaultOptions(value.options)) {
        const contextSize = this.parseContextSize(value.options?.[ModelPropertyKey.CONTEXT_SIZE])
        this.cva.value$.update((current) => {
          if (!current) {
            return current
          }
          return {
            ...current,
            options: rules.reduce(
              (acc, curr) => {
                acc[curr.name] = curr.default
                return acc
              },
              {
                ...(typeof contextSize === 'number' ? { [ModelPropertyKey.CONTEXT_SIZE]: contextSize } : {})
              } as Record<string, any>
            )
          }
        })
      }
    })

    afterNextRender(() => {
      setTimeout(() => {
        this.#cdr.detectChanges()
      }, 600)
    })
  }

  writeValue(obj: any): void {
    this.cva.writeValue(obj)
  }
  registerOnChange(fn: any): void {
    this.onChange = fn
  }
  registerOnTouched(fn: any): void {
    this.onTouched = fn
  }
  setDisabledState?(isDisabled: boolean): void {
    this.cva.setDisabledState(isDisabled)
  }

  updateValue(value: ICopilotModel | null) {
    if (!this.readonly()) {
      this.cva.value$.set(value)
    }
  }

  initModel(copilotId: string, model?: ProviderModel | null) {
    this.updateValue(
      this.withModelContextSize(
        {
          copilotId,
          model: model?.model ?? this.model(),
          modelType: this.modelType()
        },
        model
      )
    )
  }

  setModel(copilot: ICopilot, model: ProviderModel) {
    const nValue = this.withModelContextSize(
      {
        ...(this.cva.value$() ?? {}),
        model: model.model,
        copilotId: copilot.id,
        modelType: this.modelType()
      },
      model
    )
    this.updateValue(nValue)
  }

  getParameter(name: string) {
    return this._copilotModel()?.options?.[name]
  }

  updateParameter(name: string, value: any) {
    if (!this.cva.value$()) {
      this.initModel(this.copilotId(), this.selectedAiModel())
    }

    this.updateValue({
      ...this.cva.value$(),
      options: {
        ...(this.cva.value$().options ?? {}),
        [name]: value
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
      this.activeCopilotTabId.set(copilot.id)
    }
  }

  getCopilotTabModelCount(copilot: ICopilotWithProvider) {
    return copilot.providerWithModels?.models?.length ?? 0
  }

  getMenuWidth(container: HTMLElement | null | undefined) {
    return container?.getBoundingClientRect().width || 0
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
    } else {
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

  private shouldInitDefaultOptions(options?: Record<string, any>): boolean {
    if (!options) {
      return true
    }
    const keys = Object.keys(options).filter((key) => options[key] !== undefined)
    return keys.length === 0 || (keys.length === 1 && keys[0] === ModelPropertyKey.CONTEXT_SIZE)
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

  private stopRailResize() {
    this.#railResizeAbortController?.abort()
    this.#railResizeAbortController = null
    this.isRailResizing.set(false)
    document.body.classList.remove('cursor-col-resize', 'select-none')
  }
}
