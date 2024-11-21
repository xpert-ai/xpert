import { CdkListboxModule } from '@angular/cdk/listbox'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { booleanAttribute, Component, computed, effect, inject, input, model } from '@angular/core'
import { toObservable, toSignal } from '@angular/core/rxjs-interop'
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms'
import { MatInputModule } from '@angular/material/input'
import { MatSelectModule } from '@angular/material/select'
import { MatSliderModule } from '@angular/material/slider'
import { MatTooltipModule } from '@angular/material/tooltip'
import { NgmHighlightDirective, NgmSearchComponent } from '@metad/ocap-angular/common'
import { NgmDensityDirective, NgmI18nPipe, nonBlank } from '@metad/ocap-angular/core'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'
import { derivedAsync } from 'ngxtension/derived-async'
import { debounceTime, map } from 'rxjs'
import { TranslateModule } from '@ngx-translate/core'
import { ICopilot, ICopilotModel, ModelFeature, AiModelTypeEnum, PACCopilotService, CopilotServerService } from '../../../@core'

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
    MatSliderModule,
    MatSelectModule,
    MatInputModule,
    NgmSearchComponent,
    NgmI18nPipe,
    NgmHighlightDirective,
    NgmDensityDirective
  ],
  selector: 'copilot-model-select',
  templateUrl: 'select.component.html',
  styleUrls: ['select.component.scss'],
  hostDirectives: [NgxControlValueAccessor]
})
export class CopilotModelSelectComponent {
  eModelFeature = ModelFeature
  eModelType = AiModelTypeEnum

  protected cva = inject<NgxControlValueAccessor<Partial<ICopilotModel> | null>>(NgxControlValueAccessor)
  readonly copilotService = inject(PACCopilotService)
  readonly copilotServer = inject(CopilotServerService)

  // Inputs
  readonly modelType = input<AiModelTypeEnum>()
  readonly inheritModel = input<ICopilotModel>()
  readonly copilotModel = model<ICopilotModel>()

  readonly readonly = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })

  readonly hiddenLabel = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })

  // States
  readonly _copilotModel = computed(() => this.copilotModel() ?? this.inheritModel())

  readonly copilotWithModels = derivedAsync(() => this.copilotServer.getCopilotModels(this.modelType()).pipe(
      map((copilots) => {
        return copilots?.sort((a, b) => {
          const roleOrder = { primary: 0, secondary: 1, embedding: 2 };
          return roleOrder[a.role] - roleOrder[b.role];
        })
      })
    ))
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

  readonly copilots = this.copilotService.copilots
  readonly provider = computed(() => this.copilots()?.find((_) => _.id === this.copilotId())?.provider)
  readonly model = computed(() => this._copilotModel()?.model)
  readonly selectedAiModel = computed(() => this.selectedCopilotWithModels()?.providerWithModels?.models?.find((_) => _.model === this.model()))

  readonly modelParameterRules = derivedAsync(() => {
    const provider = this.provider()
    const model = this.model()
    if (provider && model) {
      return this.copilotServer.getModelParameterRules(this.provider(), this.model())
    }
    return null
  })

  readonly isInherit = computed(() => !this.copilotModel())
  
  constructor() {
    effect(
      () => {
        // todo 不应该以 null undefined 作为判断标准
        const copilotModel = this.cva.value$()
        if (copilotModel) {
          this.copilotModel.set(copilotModel)
        }
      },
      { allowSignalWrites: true }
    )
  }

  setModel(copilot: ICopilot, model: string) {
    const nValue = {
      ...(this._copilotModel() ?? {}),
      model,
      copilotId: copilot.id,
      // copilot: copilot,
      modelType: this.modelType()
    }
    this.copilotModel.set(nValue)

    this.cva.value$.set(nValue)
  }

  getParameter(name: string) {
    return this.copilotModel()?.options?.[name]
  }

  updateParameter(name: string, value: any) {
    this.copilotModel.update((state) =>
      state
        ? {
            ...state,
            options: {
              ...(state.options ?? {}),
              [name]: value
            }
          }
        : { options: { [name]: value } }
    )
  }
}
