import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { StateVariableSelectComponent } from '@cloud/app/@shared/agent'
import { JSONSchemaFormComponent } from '@cloud/app/@shared/forms'
import { SafePipe } from '@metad/core'
import { attrModel, linkedModel, NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import { AiModelTypeEnum, IWFNUnderstanding, IWorkflowNode, KnowledgebaseService, ModelFeature } from 'apps/cloud/src/app/@core'
import { XpertStudioApiService } from '../../../domain'
import { XpertWorkflowBaseComponent } from '../workflow-base.component'
import { CopilotModelSelectComponent } from '@cloud/app/@shared/copilot'
import { IconComponent } from '@cloud/app/@shared/avatar'

@Component({
  selector: 'xpert-workflow-understanding',
  templateUrl: './understanding.component.html',
  styleUrls: ['./understanding.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    MatTooltipModule,
    TranslateModule,
    SafePipe,
    NgmI18nPipe,
    JSONSchemaFormComponent,
    StateVariableSelectComponent,
    CopilotModelSelectComponent,
    IconComponent
]
})
export class XpertWorkflowUnderstandingComponent extends XpertWorkflowBaseComponent {
  eModelType = AiModelTypeEnum
  eModelFeature = ModelFeature

  readonly studioService = inject(XpertStudioApiService)
  readonly knowledgebaseAPI = inject(KnowledgebaseService)

  // Inputs
  readonly entity = input<IWorkflowNode>()

  // States
  readonly workspaceId = computed(() => this.xpert()?.workspaceId)
  readonly understanding = linkedModel({
    initialValue: null,
    compute: () => this.entity() as IWFNUnderstanding,
    update: (value) => {
      this.studioService.updateWorkflowNode(this.key(), (entity) => {
        return value
      })
    }
  })

  readonly input = attrModel(this.understanding, 'input')
  readonly visionModel = attrModel(this.understanding, 'visionModel')
  readonly provider = attrModel(this.understanding, 'provider')
  readonly understandingStrategies = toSignal(this.knowledgebaseAPI.understandingStrategies$)
  readonly #understandingStrategy = computed(() =>
    this.understandingStrategies()?.find((item) => item.meta.name === this.provider())
  )
  readonly understandingStrategy = computed(() => this.#understandingStrategy()?.meta)
  readonly requireVisionModel = computed(() => this.#understandingStrategy()?.requireVisionModel)
  readonly understandingConfigSchema = computed(() => this.understandingStrategy()?.configSchema || null)
  readonly understandingConfig = attrModel(this.understanding, 'config')
}
