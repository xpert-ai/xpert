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
  normalizeKnowledgebaseFAQRecall,
  TKBRetrievalSettings
} from '../../../@core/types'
import { CopilotModelSelectComponent } from '../../copilot/copilot-model-select'

export function hasEnabledKnowledgeRetrievalSource(
  retrieval: Partial<IKnowledgebase & TKBRetrievalSettings> | null | undefined,
  allowGraphRetrieval = true
): boolean {
  const mode = retrieval?.mode ?? retrieval?.recall?.mode ?? retrieval?.graphRag?.mode ?? 'vector'
  if (mode === 'graph' && !allowGraphRetrieval) {
    return false
  }
  const fusion = retrieval?.recall?.fusion
  if (mode !== 'hybrid' || fusion?.mode !== 'weighted_rrf') {
    return true
  }

  const weights = fusion.weights
  const enabledWeights = allowGraphRetrieval
    ? [weights?.vector, weights?.graph, weights?.keyword]
    : [weights?.vector, weights?.keyword]
  return enabledWeights.some((weight) => typeof weight === 'number' && Number.isFinite(weight) && weight > 0)
}

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
  readonly allowGraphRetrieval = input<boolean, boolean | string>(true, {
    transform: booleanAttribute
  })
  readonly defaultMode = input<GraphRagRetrievalMode>('vector')

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
    compute: () => (!this.allowGraphRetrieval() && this.mode() === 'hybrid') || this.fusion()?.mode === 'weighted_rrf',
    update: (enabled) => {
      this.fusion.update((state) => ({
        ...(state ?? {}),
        mode: enabled || (!this.allowGraphRetrieval() && this.mode() === 'hybrid') ? 'weighted_rrf' : 'legacy'
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
    compute: () => {
      const mode =
        this.knowledgebase()?.mode ??
        this.recall()?.mode ??
        (this.allowGraphRetrieval() ? this.graphRag()?.mode : undefined) ??
        this.defaultMode()
      return this.retrievalModes().includes(mode) ? mode : this.defaultMode()
    },
    update: (value) => {
      this.recall.update((state) => ({
        ...(state ?? {}),
        mode: value
      }))
      this.graphRag.update((state) => ({
        ...(state ?? {}),
        enabled: this.allowGraphRetrieval() ? state?.enabled : false,
        mode: value
      }))
      if (!this.allowGraphRetrieval()) {
        this.fusion.update((state) => ({
          ...(state ?? {}),
          mode: value === 'hybrid' ? 'weighted_rrf' : state?.mode,
          weights: {
            ...(state?.weights ?? {}),
            graph: 0
          }
        }))
      }
    }
  })
  readonly graphEnabled = attrModel(this.graphRag, 'enabled', false)
  readonly entityTopK = attrModel(this.graphRag, 'entityTopK', 8)
  readonly neighborHops = attrModel(this.graphRag, 'neighborHops', 1)
  readonly graphWeight = attrModel(this.graphRag, 'graphWeight', 0.35)
  readonly graphControlsVisible = computed(
    () => this.allowGraphRetrieval() && (this.graphEnabled() || this.mode() === 'graph' || this.mode() === 'hybrid')
  )
  readonly rrfActive = computed(() => this.mode() === 'hybrid' && this.rrfEnabled())
  readonly vectorRetrieverActive = computed(
    () =>
      this.mode() === 'vector' ||
      (this.mode() === 'hybrid' && (!this.rrfActive() || this.isPositiveWeight(this.rrfVectorWeight())))
  )
  readonly graphRetrieverActive = computed(
    () =>
      this.allowGraphRetrieval() &&
      (this.mode() === 'graph' ||
        (this.mode() === 'hybrid' && (!this.rrfActive() || this.isPositiveWeight(this.rrfGraphWeight()))))
  )
  readonly keywordRetrieverActive = computed(
    () =>
      this.mode() === 'keyword' ||
      (this.mode() === 'hybrid' && this.rrfEnabled() && this.isPositiveWeight(this.rrfKeywordWeight()))
  )
  readonly rrfHasEnabledRetriever = computed(() => {
    const knowledgebase = this.knowledgebase()
    if (this.allowGraphRetrieval()) {
      return hasEnabledKnowledgeRetrievalSource(knowledgebase)
    }
    const recall = normalizeKnowledgebaseFAQRecall({
      ...(knowledgebase?.recall ?? {}),
      mode: this.mode()
    })
    return hasEnabledKnowledgeRetrievalSource({ ...knowledgebase, mode: recall.mode, recall }, false)
  })
  readonly retrievalModes = computed<GraphRagRetrievalMode[]>(() =>
    this.allowGraphRetrieval() ? ['vector', 'keyword', 'graph', 'hybrid'] : ['vector', 'keyword', 'hybrid']
  )
  readonly useScore = linkedModel({
    initialValue: false,
    compute: () => !isNil(this.score()),
    update: (value) => {
      this.score.set(value ? (this.score() ?? 0.5) : null)
    }
  })
  readonly rerankModel = attrModel(this.knowledgebase, 'rerankModel', null)
  readonly rerankModelId = attrModel(this.knowledgebase, 'rerankModelId', null)
  readonly useRerank = linkedModel({
    initialValue: false,
    compute: () => !!(this.rerankModel() || this.rerankModelId()),
    update: (value) => {
      if (!value) {
        this.rerankModel.set(null)
        this.rerankModelId.set(null)
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

    const recall = this.allowGraphRetrieval()
      ? this.recall()
      : normalizeKnowledgebaseFAQRecall({
          ...(this.recall() ?? {}),
          mode: this.mode()
        })
    const graphRag = this.allowGraphRetrieval()
      ? this.graphRag()
      : {
          ...(this.graphRag() ?? {}),
          enabled: false,
          mode: recall.mode
        }

    this.loading.set(true)
    this.knowledgebaseAPI
      .update(this.knowledgebase().id, {
        recall,
        rerankModelId: this.useRerank() ? this.knowledgebase().rerankModelId : null,
        rerankModel: this.useRerank() ? this.rerankModel() : null,
        graphRag
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
