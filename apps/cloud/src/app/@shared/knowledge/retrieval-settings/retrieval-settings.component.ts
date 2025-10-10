import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { booleanAttribute, Component, computed, inject, input, output, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { getErrorMessage, injectToastr, KnowledgebaseService } from '@cloud/app/@core'
import { AiModelTypeEnum, IKnowledgebase } from '../../../@core/types'
import { NgmCommonModule } from '@metad/ocap-angular/common'
import { attrModel, linkedModel } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { NgxControlValueAccessor } from 'ngxtension/control-value-accessor'
import { CopilotModelSelectComponent } from '../../copilot'

/**
 *
 */
@Component({
  standalone: true,
  imports: [
    CommonModule,
    CdkMenuModule,
    FormsModule,
    TranslateModule,
    MatTooltipModule,
    NgmCommonModule,
    CopilotModelSelectComponent,
  ],
  selector: 'xp-knowledge-retrieval-settings',
  templateUrl: 'retrieval-settings.component.html',
  styleUrls: ['retrieval-settings.component.scss'],
  hostDirectives: [NgxControlValueAccessor]
})
export class KnowledgeRetrievalSettingsComponent {
  eAiModelTypeEnum = AiModelTypeEnum

  protected cva = inject<NgxControlValueAccessor<Partial<IKnowledgebase>>>(NgxControlValueAccessor)

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
        rerankModel: this.useRerank() ? this.rerankModel() : null
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
