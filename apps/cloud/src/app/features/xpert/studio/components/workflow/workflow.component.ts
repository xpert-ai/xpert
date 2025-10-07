import { CdkMenuModule } from '@angular/cdk/menu'
import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, input } from '@angular/core'
import { MatTooltipModule } from '@angular/material/tooltip'
import { FFlowModule } from '@foblex/flow'
import { TranslateModule } from '@ngx-translate/core'
import {
  IWFNTrigger,
  IWorkflowNode,
  TXpertTeamNode,
  WorkflowNodeTypeEnum,
  XpertAgentExecutionStatusEnum
} from 'apps/cloud/src/app/@core'
import { XpertWorkflowIconComponent } from '@cloud/app/@shared/workflow'
import { XpertStudioApiService } from '../../domain'
import { XpertExecutionService } from '../../services/execution.service'
import { XpertStudioComponent } from '../../studio.component'
import { XpertStudioNodeWorkflowAnswerComponent } from './answer/answer.component'
import { XpertStudioNodeWorkflowCodeComponent } from './code/code.component'
import { XpertStudioNodeWorkflowIfelseComponent } from './ifelse/ifelse.component'
import { XpertStudioNodeWorkflowIteratingComponent } from './iterating/iterating.component'
import { XpertStudioNodeWorkflowHttpComponent } from './http/http.component'
import { XpertStudioNodeWorkflowKnowledgeComponent } from './knowledge/knowledge.component'
import { XpertWorkflowNodeSubflowComponent } from './subflow/subflow.component'
import { XpertWorkflowNodeNoteComponent } from './note/note.component'
import { XpertWorkflowNodeTemplateComponent } from './template/template.component'
import { XpertWorkflowNodeClassifierComponent } from './classifier/classifier.component'
import { XpertWorkflowNodeToolComponent } from './tool/tool.component'
import { XpertWorkflowNodeAssignerComponent } from './assigner/assigner.component'
import { XpertWorkflowNodeAgentToolComponent } from './agent-tool/tool.component'
import { XpertWorkflowNodeTaskComponent } from './task/task.component'
import { XpertWorkflowNodeTriggerComponent } from './trigger/trigger.component'
import { SafePipe } from '@metad/core'
import { XpertWorkflowNodeSourceComponent } from './source/source.component'
import { XpertWorkflowNodeProcessorComponent } from './processor/processor.component'
import { XpertWorkflowNodeChunkerComponent } from './chunker/chunker.component'
import { XpertWorkflowNodeUnderstandingComponent } from './understanding/understanding.component'
import { XpertWorkflowNodeKnowledgeBaseComponent } from './knowledge-base/knowledge-base.component'
import { XpertWorkflowNodeListOperatorComponent } from './list-operator/list-operator.component'
import { XpertWorkflowNodeVariableAggregatorComponent } from './variable-aggregator/variable-aggregator.component'

@Component({
  selector: 'xpert-studio-node-workflow',
  templateUrl: './workflow.component.html',
  styleUrls: ['./workflow.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FFlowModule,
    CdkMenuModule,
    MatTooltipModule,
    TranslateModule,
    SafePipe,
    XpertWorkflowIconComponent,
    XpertStudioNodeWorkflowIfelseComponent,
    XpertStudioNodeWorkflowIteratingComponent,
    XpertStudioNodeWorkflowAnswerComponent,
    XpertStudioNodeWorkflowCodeComponent,
    XpertStudioNodeWorkflowHttpComponent,
    XpertStudioNodeWorkflowKnowledgeComponent,
    XpertWorkflowNodeSubflowComponent,
    XpertWorkflowNodeTemplateComponent,
    XpertWorkflowNodeNoteComponent,
    XpertWorkflowNodeClassifierComponent,
    XpertWorkflowNodeToolComponent,
    XpertWorkflowNodeAgentToolComponent,
    XpertWorkflowNodeAssignerComponent,
    XpertWorkflowNodeTaskComponent,
    XpertWorkflowNodeTriggerComponent,
    XpertWorkflowNodeSourceComponent,
    XpertWorkflowNodeProcessorComponent,
    XpertWorkflowNodeChunkerComponent,
    XpertWorkflowNodeUnderstandingComponent,
    XpertWorkflowNodeKnowledgeBaseComponent,
    XpertWorkflowNodeListOperatorComponent,
    XpertWorkflowNodeVariableAggregatorComponent
  ],
  host: {
    '[class]': 'type()',
  }
})
export class XpertStudioNodeWorkflowComponent {
  eXpertAgentExecutionEnum = XpertAgentExecutionStatusEnum
  eWorkflowNodeTypeEnum = WorkflowNodeTypeEnum

  readonly elementRef = inject(ElementRef)
  readonly apiService = inject(XpertStudioApiService)
  readonly executionService = inject(XpertExecutionService)
  readonly xpertStudioComponent = inject(XpertStudioComponent)

  // Inputs
  readonly node = input<TXpertTeamNode>()
  readonly startNodes = input<string[]>()

  // States
  readonly entity = computed(() => this.node()?.entity as IWorkflowNode)
  readonly key = computed(() => this.node()?.key)

  readonly type = computed(() => this.entity()?.type)
  readonly title = computed(() => this.entity()?.title)
  readonly description = computed(() => this.entity()?.description)
  readonly isStart = computed(() => this.startNodes()?.includes(this.key()))

  readonly NoInputs = [
    WorkflowNodeTypeEnum.NOTE,
    WorkflowNodeTypeEnum.TRIGGER,
    WorkflowNodeTypeEnum.TASK,
    WorkflowNodeTypeEnum.AGENT_TOOL
  ]

  // Workflow providers
  readonly triggerProviders = this.apiService.triggerProviders
  readonly triggerEntity = computed(() => this.entity()?.type === WorkflowNodeTypeEnum.TRIGGER ? this.entity() as IWFNTrigger : null)
  readonly from = computed(() => this.triggerEntity()?.from)
  readonly provider = computed(() => this.triggerProviders()?.find((item) => item.name === this.from()))
}
