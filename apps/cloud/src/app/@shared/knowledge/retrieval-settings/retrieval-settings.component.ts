import { CdkMenuModule } from '@angular/cdk/menu'

import { booleanAttribute, Component, computed, inject, input, output, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { getErrorMessage, injectToastr, KnowledgebaseService } from '@cloud/app/@core'
import { NgmCommonModule } from '@xpert-ai/ocap-angular/common'
import { attrModel, linkedModel } from '@xpert-ai/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { isNil } from 'lodash-es'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'
import { AiModelTypeEnum, GraphRagRetrievalMode, IKnowledgebase, TKBRetrievalSettings } from '../../../@core/types'
import { CopilotModelSelectComponent } from '../../copilot'
import { ZardSwitchComponent, ZardTooltipImports } from '@xpert-ai/headless-ui'
/**
 *
 */
@Component({
  standalone: true,
  imports: [
    CdkMenuModule,
    FormsModule,
    TranslateModule,
    ...ZardTooltipImports,
    ZardSwitchComponent,
    NgmCommonModule,
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
  readonly graphControlsVisible = computed(() => this.graphEnabled() || this.mode() !== 'vector')
  readonly retrievalModes: GraphRagRetrievalMode[] = ['vector', 'graph', 'hybrid']
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
}
