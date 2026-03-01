import { CdkListboxModule } from '@angular/cdk/listbox'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { afterNextRender, booleanAttribute, ChangeDetectorRef, Component, computed, effect, inject, input, model } from '@angular/core'
import { toObservable } from '@angular/core/rxjs-interop'
import { ControlValueAccessor, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { NgmHighlightDirective } from '@metad/ocap-angular/common'
import { debouncedSignal, NgmI18nPipe, nonBlank } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'
import { derivedAsync } from 'ngxtension/derived-async'
import { distinctUntilChanged, map } from 'rxjs'
import {
  AiModelTypeEnum,
  CopilotServerService,
  I18nObject,
  ICopilot,
  ICopilotModel,
  injectCopilotProviderService,
  injectCopilots,
  ModelPropertyKey,
  ModelFeature,
  ParameterType,
  ProviderModel
} from '../../../@core'
import { ModelParameterInputComponent } from '../model-parameter-input/input.component'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    TranslateModule,
    CdkMenuModule,
    CdkListboxModule,
    MatTooltipModule,
    NgmI18nPipe,
    NgmHighlightDirective,
    ModelParameterInputComponent
  ],
  selector: 'copilot-model-select',
  templateUrl: 'select.component.html',
  styleUrls: ['select.component.scss'],
  hostDirectives: [NgxControlValueAccessor],
  host: {
    '[class.readonly]': 'readonly()',
    '[class.status-choose]': 'statusChoose()',
  }
})
export class CopilotModelSelectComponent implements ControlValueAccessor {
  eModelFeature = ModelFeature
  eModelType = AiModelTypeEnum
  eParameterType = ParameterType

  protected cva = inject<NgxControlValueAccessor<Partial<ICopilotModel> | null>>(NgxControlValueAccessor)
  readonly copilotServer = inject(CopilotServerService)
  readonly copilotProviderService = injectCopilotProviderService()
  readonly copilots = injectCopilots()
  readonly i18n = new NgmI18nPipe()
  readonly #cdr = inject(ChangeDetectorRef)

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
        return copilots?.filter((_) => copilot ? _.id === copilot.id : true )
          .sort((a, b) => {
            const roleOrder = { primary: 0, secondary: 1, embedding: 2 }
            return roleOrder[a.role] - roleOrder[b.role]
          })
      })
    )
  })
  readonly copilotWithModels$ = toObservable(this.copilotWithModels)

  readonly searchTerm = model('')
  readonly #searchTerm = debouncedSignal(this.searchTerm, 300)
  readonly searchedModels = computed(() => {
    const searchText = this.#searchTerm()
    const copilots = this.features()?.length ? this.copilotWithModels()?.map((_) => {
      return {
        ..._,
        providerWithModels: {
          ..._.providerWithModels,
          models: _.providerWithModels.models.filter((m) =>
            this.features().every((feature) => m.features?.includes(feature))
          )
        }
      }
    }).filter((_) => _.providerWithModels.models.length) : this.copilotWithModels()
    
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
            if (this.i18n.transform(_.providerWithModels.label)?.toLowerCase().includes(searchText) ||
               _.name?.toLowerCase().includes(searchText)) {
              return _
            }
            return null
          })
          .filter(nonBlank)
      : copilots
  })

  readonly copilotId = computed(() => this._copilotModel()?.copilotId)
  readonly selectedCopilotWithModels = computed(() => {
    return this.copilotWithModels()?.find((_) => _.id === this.copilotId())
  })

  readonly provider = computed(
    () => this.copilots()?.find((_) => _.id === this.copilotId())?.modelProvider?.providerName
  )
  readonly providerId = computed(() => this.copilots()?.find((_) => _.id === this.copilotId())?.modelProvider?.id)

  readonly model = computed(() => this._copilotModel()?.model)

  readonly selectedAiModel = computed(() =>
    this.selectedCopilotWithModels()?.providerWithModels?.models?.find((_) => _.model === this.model() &&
      (this.modelType() ? _.model_type === this.modelType() : true))
  )

  readonly modelParameterRules = derivedAsync(() => {
    const provider = this.provider()
    const model = this.model()
    if (provider && model) {
      return this.copilotProviderService.getModelParameterRules(this.providerId(), this.modelType(), this.model())
    }
    return null
  })

  readonly isInherit = computed(() => !this.__copilotModel())
  readonly statusChoose = computed(() => !this.selectedCopilotWithModels() && !!this.__copilotModel())

  onChange: ((value: ICopilotModel | null) => void) | null = null
  onTouched: (() => void) | null = null
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
            options: rules.reduce((acc, curr) => {
              acc[curr.name] = curr.default
              return acc
            }, {
              ...(typeof contextSize === 'number' ? {[ModelPropertyKey.CONTEXT_SIZE]: contextSize} : {})
            } as Record<string, any>)
          }
        })
      }
    }, { allowSignalWrites: true })

    afterNextRender(() => {
      setTimeout(() => {
        this.#cdr.detectChanges()
      }, 600);
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
    this.updateValue(this.withModelContextSize({
      copilotId,
      model: model?.model ?? this.model(),
      modelType: this.modelType()
    }, model))
  }

  setModel(copilot: ICopilot, model: ProviderModel) {
    const nValue = this.withModelContextSize({
      ...(this.cva.value$() ?? {}),
      model: model.model,
      copilotId: copilot.id,
      modelType: this.modelType()
    }, model)
    this.updateValue(nValue)
  }

  getParameter(name: string) {
    return this._copilotModel()?.options?.[name]
  }

  updateParameter(name: string, value: any) {
    if (!this.cva.value$()) {
      this.initModel(this.copilotId(), this.selectedAiModel())
    }
    
    this.updateValue(
      {
        ...this.cva.value$(),
        options: {
          ...(this.cva.value$().options ?? {}),
          [name]: value
        }
      }
    )
  }

  delete() {
    this.updateValue(null)
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
}
