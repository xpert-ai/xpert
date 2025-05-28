import { CdkMenuModule } from '@angular/cdk/menu'
import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, input } from '@angular/core'
import { MatTooltipModule } from '@angular/material/tooltip'
import { FFlowModule } from '@foblex/flow'
import { TranslateModule } from '@ngx-translate/core'
import {
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
import { XpertStudioNodeWorkflowSplitterComponent } from './splitter/splitter.component'
import { XpertStudioNodeWorkflowHttpComponent } from './http/http.component'
import { XpertStudioNodeWorkflowKnowledgeComponent } from './knowledge/knowledge.component'
import { XpertWorkflowNodeSubflowComponent } from './subflow/subflow.component'
import { XpertWorkflowNodeNoteComponent } from './note/note.component'

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
    XpertWorkflowIconComponent,
    XpertStudioNodeWorkflowIfelseComponent,
    XpertStudioNodeWorkflowIteratingComponent,
    XpertStudioNodeWorkflowSplitterComponent,
    XpertStudioNodeWorkflowAnswerComponent,
    XpertStudioNodeWorkflowCodeComponent,
    XpertStudioNodeWorkflowHttpComponent,
    XpertStudioNodeWorkflowKnowledgeComponent,
    XpertWorkflowNodeSubflowComponent,
    XpertWorkflowNodeNoteComponent
  ],
  host: {
    tabindex: '-1',
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

  // private get hostElement(): HTMLElement {
  //   return this.elementRef.nativeElement
  // }

  constructor() {
    effect(() => {
      // console.log(this.node())
    })
  }

  // protected emitSelectionChangeEvent(event: MouseEvent): void {
  //   this.hostElement.focus()
  //   event.preventDefault()
  //   event.stopPropagation()

  //   // Open Context menu
  // }
}
