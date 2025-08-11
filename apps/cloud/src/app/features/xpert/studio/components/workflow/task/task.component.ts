import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, input } from '@angular/core'
import { MatTooltipModule } from '@angular/material/tooltip'
import { FFlowModule } from '@foblex/flow'
import { NgmSpinComponent } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import {
  IWFNTask,
  IWorkflowNode,
  TXpertTeamNode,
  WorkflowNodeTypeEnum,
  XpertAgentExecutionStatusEnum
} from 'apps/cloud/src/app/@core'
import { isEqual } from 'lodash-es'
import { NgxFloatUiModule, NgxFloatUiTriggers } from 'ngx-float-ui'
import { NgxJsonViewerModule } from 'ngx-json-viewer'
import { XpertStudioApiService } from '../../../domain'
import { XpertExecutionService } from '../../../services/execution.service'

@Component({
  selector: 'xpert-workflow-node-task',
  templateUrl: './task.component.html',
  styleUrls: ['./task.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FFlowModule, MatTooltipModule, TranslateModule, NgxFloatUiModule, NgmSpinComponent, NgxJsonViewerModule]
})
export class XpertWorkflowNodeTaskComponent {
  eXpertAgentExecutionEnum = XpertAgentExecutionStatusEnum
  eWorkflowNodeTypeEnum = WorkflowNodeTypeEnum
  eNgxFloatUiTriggers = NgxFloatUiTriggers

  readonly elementRef = inject(ElementRef)
  readonly studioService = inject(XpertStudioApiService)
  readonly executionService = inject(XpertExecutionService)

  // Inputs
  readonly node = input<TXpertTeamNode>()
  readonly entity = input<IWorkflowNode>()

  // States
  readonly taskEntity = computed(() => this.entity() as IWFNTask)
  readonly key = computed(() => this.node()?.key)

  readonly nodes = computed(() => this.studioService.viewModel().nodes)
  readonly connections = computed(() => this.studioService.viewModel().connections)
  // Who call me
  readonly parentAgents = computed(
    () => {
      const parentKeys = this.connections()
        .filter((conn) => conn.to === this.key())
        .map((conn) => conn.from)
      return this.nodes()
        .filter((node) => parentKeys.includes(node.key) && node.type === 'agent')
        .map((node) => node.key)
    },
    { equal: isEqual }
  )
  // Agents who are not parents can be connected from this task
  readonly canBeConnectedInputs = computed(() =>
    this.nodes()
      .filter((_) => _.type === 'agent' && !this.parentAgents().includes(_.key))
      .map((_) => _.key)
  )

  // Executions
  readonly executions = computed(() => {
    const messages = this.executionService.toolMessages()
    return messages
      ?.map((_) => _.data)
      .filter((e) => e.tool === this.key().toLowerCase() && e.toolset === 'workflow_task')
  })

  // constructor() {
  //   effect(() => {
  //     console.log(this.executions(), this.executionService.toolMessages())
  //   })
  // }
}
