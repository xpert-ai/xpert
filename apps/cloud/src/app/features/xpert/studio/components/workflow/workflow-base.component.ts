import { Component, computed, ElementRef, inject, input } from '@angular/core'
import {
  AiModelTypeEnum,
  IWorkflowNode,
  TXpertTeamNode,
  WorkflowNodeTypeEnum,
  XpertAgentExecutionStatusEnum
} from '@cloud/app/@core'
import { XpertStudioApiService } from '../../domain'

@Component({
  selector: 'xp-workflow-node-base',
  template: ''
})
export class WorkflowBaseNodeComponent {
  eXpertAgentExecutionEnum = XpertAgentExecutionStatusEnum
  eWorkflowNodeTypeEnum = WorkflowNodeTypeEnum
  eModelType = AiModelTypeEnum

  readonly elementRef = inject(ElementRef)
  readonly studioService = inject(XpertStudioApiService)

  // Inputs
  readonly node = input<TXpertTeamNode>()
  readonly entity = input<IWorkflowNode>()

  readonly xpertCopilotModel = computed(() => this.studioService.viewModel()?.team.copilotModel)
  readonly nodes = computed(() => this.studioService.viewModel().nodes)
  readonly connections = computed(() => this.studioService.viewModel().connections)
  readonly nodeParentId = computed(() => this.node()?.parentId)
  readonly canBeConnectedInputs = computed(() =>
    this.nodes()
      .filter((_) => this.nodeParentId() ? _.parentId === this.nodeParentId() : !_.parentId)
      .filter((_) => _.type === 'agent' || _.type === 'workflow')
      .map((_) => _.key + '/edge')
  )
}
