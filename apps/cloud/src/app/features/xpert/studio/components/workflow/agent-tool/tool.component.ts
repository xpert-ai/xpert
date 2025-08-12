import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, input } from '@angular/core'
import { MatTooltipModule } from '@angular/material/tooltip'
import { FFlowModule } from '@foblex/flow'
import { TranslateModule } from '@ngx-translate/core'
import {
  AiModelTypeEnum,
  IWFNAgentTool,
  IWorkflowNode,
  TXpertTeamNode,
  WorkflowNodeTypeEnum,
  XpertAgentExecutionStatusEnum
} from 'apps/cloud/src/app/@core'
import { XpertStudioApiService } from '../../../domain'
import { XpertExecutionService } from '../../../services/execution.service'
import { NgmSpinComponent } from '@metad/ocap-angular/common'

@Component({
  selector: 'xpert-workflow-node-agent-tool',
  templateUrl: './tool.component.html',
  styleUrls: ['./tool.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FFlowModule, MatTooltipModule, TranslateModule, NgmSpinComponent]
})
export class XpertWorkflowNodeAgentToolComponent {
  eXpertAgentExecutionEnum = XpertAgentExecutionStatusEnum
  eWorkflowNodeTypeEnum = WorkflowNodeTypeEnum
  eModelType = AiModelTypeEnum

  readonly elementRef = inject(ElementRef)
  readonly studioService = inject(XpertStudioApiService)
  readonly executionService = inject(XpertExecutionService)

  // Inputs
  readonly node = input<TXpertTeamNode>()
  readonly entity = input<IWorkflowNode>()

  // States
  readonly toolEntity = computed(() => this.entity() as IWFNAgentTool)

  readonly toolName = computed(() => this.toolEntity().toolName)
  readonly toolDescription = computed(() => this.toolEntity().toolDescription)
  readonly isEnd = computed(() => this.toolEntity().isEnd)

  readonly executions = computed(() => {
    return this.executionService.toolMessages()?.map((_) => _.data).filter((e) => e.tool === this.toolName())
  })

  // constructor() {
  //   effect(() => {
  //     console.log(this.executionService.toolMessages())
  //   })
  // }
}
