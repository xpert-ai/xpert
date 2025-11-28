import { CdkMenuModule } from '@angular/cdk/menu'
import { TextFieldModule } from '@angular/cdk/text-field'
import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatSlideToggleModule } from '@angular/material/slide-toggle'
import { MatTooltipModule } from '@angular/material/tooltip'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { attrModel, linkedModel, NgmDensityDirective } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import {
  IfAnimation,
  injectHelpWebsite,
  injectToastr,
  IWFNTrigger,
  IWorkflowNode,
  TXpertTeamNode,
  WorkflowNodeTypeEnum
} from 'apps/cloud/src/app/@core'
import { XpertStudioApiService } from '../../domain'
import { XpertStudioComponent } from '../../studio.component'
import { XpertStudioPanelComponent } from '../panel.component'
import { XpertStudioPanelWorkflowIfelseComponent } from './ifelse/ifelse.component'
import { XpertStudioPanelWorkflowIteratingComponent } from './iterating/iterating.component'
import { XpertStudioPanelWorkflowAnswerComponent } from './answer/answer.component'
import { XpertStudioPanelWorkflowCodeComponent } from './code/code.component'
import { XpertWorkflowCodeTestComponent } from './code-test/code.component'
import { XpertWorkflowHttpComponent } from './http/http.component'
import { XpertWorkflowKnowledgeComponent } from './knowledge/knowledge.component'
import { XpertWorkflowKnowledgeTestComponent } from './knowledge-test/knowledge.component'
import { XpertWorkflowSubflowComponent } from './subflow/subflow.component'
import { XpertWorkflowIconComponent } from '@cloud/app/@shared/workflow'
import { XpertWorkflowTemplateComponent } from './template/template.component'
import { XpertWorkflowNoteComponent } from './note/note.component'
import { XpertWorkflowClassifierComponent } from './classifier/classifier.component'
import { XpertWorkflowToolComponent } from './tool/tool.component'
import { XpertWorkflowAssignerComponent } from './assigner/assigner.component'
import { XpertWorkflowAgentToolComponent } from './agent-tool/tool.component'
import { XpertWorkflowTaskComponent } from './task/task.component'
import { XpertWorkflowSkillComponent } from './skill/skill.component'
import { XpertWorkflowTriggerComponent } from './trigger/trigger.component'
import { XpertWorkflowTriggerTestComponent } from './trigger-test/trigger.component'
import { XpertWorkflowSourceComponent } from './source/source.component'
import { XpertWorkflowProcessorComponent } from './processor/processor.component'
import { XpertWorkflowChunkerComponent } from './chunker/chunker.component'
import { XpertWorkflowUnderstandingComponent } from './understanding/understanding.component'
import { XpertWorkflowKnowledgeBaseComponent } from './knowledge-base/knowledge-base.component'
import { XpertWorkflowSourceTestComponent } from './source-test/source.component'
import { XpertWorkflowListOperatorComponent } from './list-operator/list-operator.component'
import { XpertWorkflowVariableAggregatorComponent } from './variable-aggregator/variable-aggregator.component'
import { XpertWorkflowPanelDBInsertComponent } from './db-insert/db-insert.component'
import { XpertWorkflowPanelDBUpdateComponent } from './db-update/db-update.component'
import { XpertWorkflowPanelDBSQLComponent } from './db-sql/db-sql.component'
import { XpertWorkflowPanelDBDeleteComponent } from './db-delete/db-delete.component'
import { IconComponent } from '@cloud/app/@shared/avatar'
import { XpertWorkflowPanelJSONStringifyComponent } from './json-stringify/json-stringify.component'
import { XpertWorkflowPanelJSONParseComponent } from './json-parse/json-parse.component'

@Component({
  selector: 'xpert-studio-panel-workflow',
  templateUrl: './workflow.component.html',
  styleUrls: ['./workflow.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    TranslateModule,
    CdkMenuModule,
    MatSlideToggleModule,
    MatTooltipModule,
    TextFieldModule,
    NgmDensityDirective,
    NgmSpinComponent,
    IconComponent,
    XpertStudioPanelWorkflowIfelseComponent,
    XpertStudioPanelWorkflowIteratingComponent,
    XpertStudioPanelWorkflowAnswerComponent,
    XpertStudioPanelWorkflowCodeComponent,
    XpertWorkflowCodeTestComponent,
    XpertWorkflowHttpComponent,
    XpertWorkflowIconComponent,
    XpertWorkflowKnowledgeComponent,
    XpertWorkflowKnowledgeTestComponent,
    XpertWorkflowSubflowComponent,
    XpertWorkflowTemplateComponent,
    XpertWorkflowNoteComponent,
    XpertWorkflowClassifierComponent,
    XpertWorkflowToolComponent,
    XpertWorkflowAgentToolComponent,
    XpertWorkflowAssignerComponent,
    XpertWorkflowTaskComponent,
    XpertWorkflowSkillComponent,
    XpertWorkflowTriggerComponent,
    XpertWorkflowTriggerTestComponent,
    XpertWorkflowSourceComponent,
    XpertWorkflowSourceTestComponent,
    XpertWorkflowProcessorComponent,
    XpertWorkflowChunkerComponent,
    XpertWorkflowUnderstandingComponent,
    XpertWorkflowKnowledgeBaseComponent,
    XpertWorkflowListOperatorComponent,
    XpertWorkflowVariableAggregatorComponent,
    XpertWorkflowPanelDBInsertComponent,
    XpertWorkflowPanelDBUpdateComponent,
    XpertWorkflowPanelDBSQLComponent,
    XpertWorkflowPanelDBDeleteComponent,
    XpertWorkflowPanelJSONStringifyComponent,
    XpertWorkflowPanelJSONParseComponent
  ],
  animations: [IfAnimation,]
})
export class XpertStudioPanelWorkflowComponent {
  eWorkflowNodeTypeEnum = WorkflowNodeTypeEnum

  readonly elementRef = inject(ElementRef)
  readonly xpertStudioComponent = inject(XpertStudioComponent)
  readonly panelComponent = inject(XpertStudioPanelComponent)
  readonly studioService = inject(XpertStudioApiService)
  readonly helpUrl = injectHelpWebsite()
  readonly #toastr = injectToastr()

  // Inputs
  readonly node = input<TXpertTeamNode>()

  // States
  readonly wfNode = linkedModel({
      initialValue: null,
      compute: () => this.node().entity as IWorkflowNode,
      update: (value) => {
        this.studioService.updateWorkflowNode(this.key(), () => value)
      }
    })
  readonly xpert = this.xpertStudioComponent.xpert
  readonly xpertId = computed(() => this.xpert()?.id)
  readonly workspaceId = computed(() => this.xpert()?.workspaceId)
  readonly key = computed(() => this.node()?.key)
  // readonly wfNode = computed(() => this.node().entity as IWorkflowNode)
  readonly type = computed(() => this.wfNode()?.type)

  readonly title = attrModel(this.wfNode, 'title')
  readonly description = attrModel(this.wfNode, 'description')

  readonly loading = signal(false)


  readonly testing = signal(false)

  // Workflow providers
  readonly triggerProviders = this.studioService.triggerProviders
  readonly triggerEntity = computed(() => this.wfNode()?.type === WorkflowNodeTypeEnum.TRIGGER ? this.wfNode() as IWFNTrigger : null)
  readonly from = computed(() => this.triggerEntity()?.from)
  readonly provider = computed(() => this.triggerProviders()?.find((item) => item.name === this.from()))

  openTest() {
    this.testing.set(true)
  }

  moveToNode() {
    this.xpertStudioComponent.centerGroupOrNode(this.key())
  }

  remove() {
    this.studioService.removeNode(this.key())
  }

  closePanel() {
    this.panelComponent.close()
  }
}
