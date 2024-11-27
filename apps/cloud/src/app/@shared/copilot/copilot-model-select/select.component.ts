import { CdkListboxModule } from '@angular/cdk/listbox'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { booleanAttribute, Component, computed, effect, inject, input, model } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { NgmHighlightDirective, NgmSearchComponent } from '@metad/ocap-angular/common'
import { NgmI18nPipe, nonBlank } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'
import { derivedAsync } from 'ngxtension/derived-async'
import { debounceTime, map } from 'rxjs'
import {
  AiModelTypeEnum,
  CopilotServerService,
  ICopilot,
  ICopilotModel,
  injectCopilotProviderService,
  injectCopilots,
  ModelFeature,
  PACCopilotService,
  ParameterType
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
    NgmSearchComponent,
    NgmI18nPipe,
    NgmHighlightDirective,
    ModelParameterInputComponent
  ],
  selector: 'copilot-model-select',
  templateUrl: 'select.component.html',
  styleUrls: ['select.component.scss'],
  hostDirectives: [NgxControlValueAccessor]
})
export class CopilotModelSelectComponent {
  eModelFeature = ModelFeature
  eModelType = AiModelTypeEnum
  eParameterType = ParameterType

  protected cva = inject<NgxControlValueAccessor<Partial<ICopilotModel> | null>>(NgxControlValueAccessor)
  readonly copilotService = inject(PACCopilotService)
  readonly copilotServer = inject(CopilotServerService)
  readonly copilotProviderService = injectCopilotProviderService()
  readonly copilots = injectCopilots()

  // Inputs
  readonly modelType = input<AiModelTypeEnum>()
  readonly inheritModel = input<ICopilotModel>()
  readonly copilotModel = input<ICopilotModel>()
  
  readonly copilot = input<ICopilot>()

  readonly readonly = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })

  readonly hiddenLabel = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })

  readonly label = input<string>()

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

  readonly searchControl = new FormControl()
  readonly searchText = toSignal(this.searchControl.valueChanges.pipe(debounceTime(300)))
  readonly searchedModels = computed(() => {
    const searchText = this.searchText()
    const copilots = this.copilotWithModels()
    return searchText
      ? copilots
          ?.map((_) => {
            const models = _.providerWithModels.models.filter((m) => m.model.includes(searchText))
            if (models.length) {
              return {
                ..._,
                providerWithModels: {
                  ..._.providerWithModels,
                  models
                }
              }
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
      return this.copilotProviderService.getModelParameterRules(this.providerId(), this.model())
    }
    return null
  })

  readonly isInherit = computed(() => !this.__copilotModel())

  constructor() {
    effect(() => {
      console.log(this.searchedModels())
    })
  }

  updateValue(value: ICopilotModel) {
    if (!this.readonly()) {
      this.cva.value$.set(value)
    }
  }

  initModel(copilotId: string, model: string) {
    this.updateValue({
      copilotId,
      model,
      modelType: this.modelType()
    })
  }

  setModel(copilot: ICopilot, model: string) {
    const nValue = {
      ...(this.cva.value$() ?? {}),
      model,
      copilotId: copilot.id,
      modelType: this.modelType()
    }
    this.updateValue(nValue)
  }

  getParameter(name: string) {
    return this._copilotModel()?.options?.[name]
  }

  updateParameter(name: string, value: any) {
    if (!this.cva.value$()) {
      this.initModel(this.copilotId(), this.model())
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
}
