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
import { XpertWorkflowTriggerComponent } from './trigger/trigger.component'
import { XpertWorkflowTriggerTestComponent } from './trigger-test/trigger.component'

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
    XpertWorkflowTriggerComponent,
    XpertWorkflowTriggerTestComponent
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
