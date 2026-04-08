import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { FormsModule } from '@angular/forms'
import { StateVariableSelectComponent } from '@cloud/app/@shared/agent'
import { IconComponent } from '@cloud/app/@shared/avatar'
import { CopilotModelSelectComponent, CopilotPromptEditorComponent } from '@cloud/app/@shared/copilot'
import { JSONSchemaFormComponent } from '@cloud/app/@shared/forms'
import { attrModel, linkedModel, NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import {
  AiModelTypeEnum,
  IWFNKnowledgeBase,
  IWFNUnderstanding,
  IWorkflowNode,
  KnowledgebaseService,
  ModelFeature,
  WorkflowNodeTypeEnum
} from 'apps/cloud/src/app/@core'
import { XpertStudioApiService } from '../../../domain'
import { XpertWorkflowBaseComponent } from '../workflow-base.component'
import { ZardTooltipImports } from '@xpert-ai/headless-ui'

@Component({
  selector: 'xpert-workflow-understanding',
  templateUrl: './understanding.component.html',
  styleUrls: ['./understanding.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    ...ZardTooltipImports,
    TranslateModule,
    NgmI18nPipe,
    JSONSchemaFormComponent,
    StateVariableSelectComponent,
    CopilotModelSelectComponent,
    CopilotPromptEditorComponent,
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
  readonly promptTemplate = attrModel(this.understandingConfig, 'promptTemplate')
  readonly promptTemplateSchema = computed(() => this.understandingConfigSchema()?.properties?.['promptTemplate'] ?? null)
  readonly defaultPromptTemplate = computed(() =>
    typeof this.promptTemplateSchema()?.default === 'string' ? this.promptTemplateSchema().default : ''
  )
  readonly promptTemplateValue = computed(() => this.promptTemplate() ?? this.defaultPromptTemplate())
  readonly remainingUnderstandingConfigSchema = computed(() => {
    const schema = this.understandingConfigSchema()
    if (!schema?.properties?.['promptTemplate']) {
      return schema
    }

    const { promptTemplate, ...properties } = schema.properties
    const required = schema.required?.filter((name) => name !== 'promptTemplate')
    return {
      ...schema,
      properties,
      required: required?.length ? required : undefined
    }
  })
  readonly hasRemainingUnderstandingConfig = computed(
    () => !!Object.keys(this.remainingUnderstandingConfigSchema()?.properties ?? {}).length
  )

  readonly knowledgebaseNode = computed(
    () =>
      this.nodes().find((node) => node.type === 'workflow' && node.entity.type === WorkflowNodeTypeEnum.KNOWLEDGE_BASE)
        ?.entity as IWFNKnowledgeBase
  )
  readonly kbVisionModel = computed(() => this.knowledgebaseNode()?.visionModel)

  updatePromptTemplate(value: string) {
    this.promptTemplate.set(value)
  }
}
