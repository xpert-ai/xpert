import { CdkMenuModule } from '@angular/cdk/menu'
import { TextFieldModule } from '@angular/cdk/text-field'
import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatInputModule } from '@angular/material/input'
import { MatSlideToggleModule } from '@angular/material/slide-toggle'
import { MatTooltipModule } from '@angular/material/tooltip'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { NgmDensityDirective } from '@metad/ocap-angular/core'
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
import { XpertWorkflowIconComponent } from '../../components/workflow/icon/icon.component'
import { XpertWorkflowKnowledgeComponent } from './knowledge/knowledge.component'
import { XpertWorkflowKnowledgeTestComponent } from './knowledge-test/knowledge.component'

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
    MatInputModule,
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
    XpertWorkflowKnowledgeTestComponent
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
  readonly xpert = this.xpertStudioComponent.xpert
  readonly xpertId = computed(() => this.xpert()?.id)
  readonly workspaceId = computed(() => this.xpert()?.workspaceId)
  readonly key = computed(() => this.node()?.key)
  readonly wfNode = computed(() => this.node().entity as IWorkflowNode)
  readonly type = computed(() => this.wfNode()?.type)

  readonly loading = signal(false)

  get title() {
    return this.wfNode().title
  }
  set title(value) {
    this.studioService.updateBlock(this.key(), {
      entity: {
        ...this.wfNode(),
        title: value
      }
    })
  }

  get description() {
    return this.wfNode().description
  }
  set description(value) {
    this.studioService.updateBlock(this.key(), {
      entity: {
        ...this.wfNode(),
        description: value
      }
    })
  }

  readonly testing = signal(false)

  openTest() {
    this.testing.set(true)
  }

  remove() {
    this.studioService.removeNode(this.key())
  }

  closePanel() {
    this.panelComponent.close()
  }
}
