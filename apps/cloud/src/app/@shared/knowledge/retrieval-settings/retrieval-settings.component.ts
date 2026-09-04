import { CdkMenuModule } from '@angular/cdk/menu'

import { NgTemplateOutlet } from '@angular/common'
import { booleanAttribute, Component, computed, inject, input, output, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { getErrorMessage, injectToastr, KnowledgebaseService } from '@cloud/app/@core'
import {
  attrModel,
  linkedModel,
  XpCommonModule,
  ZardBadgeComponent,
  ZardButtonComponent,
  ZardCardImports,
  ZardInputDirective,
  ZardSliderComponent,
  ZardSwitchComponent,
  ZardTabsImports,
  ZardTooltipImports
} from '@xpert-ai/headless-ui'
import { TranslateModule } from '@ngx-translate/core'
import { isNil } from 'lodash-es'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'
import {
  AiModelTypeEnum,
  DEFAULT_KNOWLEDGE_RRF_RANK_CONSTANT,
  DEFAULT_KNOWLEDGE_RRF_WEIGHTS,
  GraphRagRetrievalMode,
  IKnowledgebase,
  TKBRetrievalSettings
} from '../../../@core/types'
import { CopilotModelSelectComponent } from '../../copilot/copilot-model-select'
/**
 *
 */
@Component({
  standalone: true,
  imports: [
    CdkMenuModule,
    FormsModule,
    NgTemplateOutlet,
    TranslateModule,
    ...ZardTooltipImports,
    ...ZardTabsImports,
    ...ZardCardImports,
    ZardBadgeComponent,
    ZardButtonComponent,
    ZardInputDirective,
    ZardSliderComponent,
    ZardSwitchComponent,
    XpCommonModule,
    CopilotModelSelectComponent
  ],
  selector: 'xp-knowledge-retrieval-settings',
  templateUrl: 'retrieval-settings.component.html',
  styleUrls: ['retrieval-settings.component.scss'],
  hostDirectives: [NgxControlValueAccessor]
})
export class KnowledgeRetrievalSettingsComponent {
  eAiModelTypeEnum = AiModelTypeEnum

  protected cva =
    inject<NgxControlValueAccessor<Partial<IKnowledgebase & TKBRetrievalSettings>>>(NgxControlValueAccessor)

  readonly knowledgebaseAPI = inject(KnowledgebaseService)
  readonly #toastrService = injectToastr()

  // Inputs
  readonly savable = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })

  readonly knowledgebase = this.cva.value$

  readonly close = output<boolean | void>()

  readonly loading = signal(false)

  readonly recall = attrModel(this.knowledgebase, 'recall')
  readonly score = attrModel(this.recall, 'score', null)
  readonly topK = attrModel(this.recall, 'topK', null)
  readonly fusion = attrModel(this.recall, 'fusion', {})
  readonly fusionWeights = attrModel(this.fusion, 'weights', {})
  readonly rrfEnabled = linkedModel<boolean>({
    initialValue: false,
    compute: () => this.fusion()?.mode === 'weighted_rrf',
    update: (enabled) => {
      this.fusion.update((state) => ({
        ...(state ?? {}),
        mode: enabled ? 'weighted_rrf' : 'legacy'
      }))
    }
  })
  readonly rrfRankConstant = attrModel(this.fusion, 'rankConstant', DEFAULT_KNOWLEDGE_RRF_RANK_CONSTANT)
  readonly rrfVectorWeight = attrModel(this.fusionWeights, 'vector', DEFAULT_KNOWLEDGE_RRF_WEIGHTS.vector)
  readonly rrfGraphWeight = attrModel(this.fusionWeights, 'graph', DEFAULT_KNOWLEDGE_RRF_WEIGHTS.graph)
  readonly rrfKeywordWeight = attrModel(this.fusionWeights, 'keyword', DEFAULT_KNOWLEDGE_RRF_WEIGHTS.keyword)
  readonly graphRag = attrModel(this.knowledgebase, 'graphRag', {})
  readonly mode = linkedModel<GraphRagRetrievalMode>({
    initialValue: 'vector',
    compute: () => this.graphRag()?.mode ?? this.knowledgebase()?.mode ?? 'vector',
    update: (value) => {
      this.graphRag.update((state) => ({
        ...(state ?? {}),
        mode: value
      }))
    }
  })
  readonly graphEnabled = attrModel(this.graphRag, 'enabled', false)
  readonly entityTopK = attrModel(this.graphRag, 'entityTopK', 8)
  readonly neighborHops = attrModel(this.graphRag, 'neighborHops', 1)
  readonly graphWeight = attrModel(this.graphRag, 'graphWeight', 0.35)
  readonly graphControlsVisible = computed(
    () => this.graphEnabled() || this.mode() === 'graph' || this.mode() === 'hybrid'
  )
  readonly rrfActive = computed(() => this.mode() === 'hybrid' && this.rrfEnabled())
  readonly vectorRetrieverActive = computed(
    () =>
      this.mode() === 'vector' ||
      (this.mode() === 'hybrid' && (!this.rrfActive() || this.isPositiveWeight(this.rrfVectorWeight())))
  )
  readonly graphRetrieverActive = computed(
    () =>
      this.mode() === 'graph' ||
      (this.mode() === 'hybrid' && (!this.rrfActive() || this.isPositiveWeight(this.rrfGraphWeight())))
  )
  readonly keywordRetrieverActive = computed(
    () =>
      this.mode() === 'keyword' ||
      (this.mode() === 'hybrid' && this.rrfEnabled() && this.isPositiveWeight(this.rrfKeywordWeight()))
  )
  readonly rrfHasEnabledRetriever = computed(
    () =>
      !this.rrfActive() ||
      [this.rrfVectorWeight(), this.rrfGraphWeight(), this.rrfKeywordWeight()].some(
        (weight) => typeof weight === 'number' && Number.isFinite(weight) && weight > 0
      )
  )
  readonly retrievalModes: GraphRagRetrievalMode[] = ['vector', 'keyword', 'graph', 'hybrid']
  readonly useScore = linkedModel({
    initialValue: false,
    compute: () => !isNil(this.score()),
    update: (value) => {
      this.score.set(value ? (this.score() ?? 0.5) : null)
    }
  })
  readonly rerankModel = attrModel(this.knowledgebase, 'rerankModel', null)
  readonly useRerank = linkedModel({
    initialValue: false,
    compute: () => !!this.rerankModel(),
    update: (value) => {
      if (!value) {
        this.rerankModel.set(null)
      }
    }
  })

  saveRetrievalSettings() {
    if (!this.rrfHasEnabledRetriever()) {
      this.#toastrService.error('XP.Knowledgebase.RRFPositiveWeightRequired', '', {
        Default: 'RRF requires at least one retrieval source with a positive weight.'
      })
      return
    }

    this.loading.set(true)
    this.knowledgebaseAPI
      .update(this.knowledgebase().id, {
        recall: this.recall(),
        rerankModelId: this.useRerank() ? this.knowledgebase().rerankModelId : null,
        rerankModel: this.useRerank() ? this.rerankModel() : null,
        graphRag: this.graphRag()
      })
      .subscribe({
        next: (kb) => {
          this.loading.set(false)
          this.close.emit(true)
        },
        error: (err) => {
          this.#toastrService.error(getErrorMessage(err))
          this.loading.set(false)
        }
      })
  }

  cancel() {
    this.close.emit()
  }

  private isPositiveWeight(value: unknown): boolean {
    return typeof value === 'number' && Number.isFinite(value) && value > 0
  }
}
