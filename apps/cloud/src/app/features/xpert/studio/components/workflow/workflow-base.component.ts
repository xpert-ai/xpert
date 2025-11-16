import { Component, computed, ElementRef, inject, input } from '@angular/core'
import { XpertStudioApiService } from '../../domain'
import { AiModelTypeEnum, IWorkflowNode, TXpertTeamNode, WorkflowNodeTypeEnum, XpertAgentExecutionStatusEnum } from '@cloud/app/@core'

@Component({
  selector: '',
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
  readonly canBeConnectedInputs = computed(() =>
    this.nodes()
      .filter((_) => _.type === 'agent' || _.type === 'workflow')
      // .map((_) => _.type === 'workflow' ? _.key + '/edge' : _.key)
      .map((_) => _.key + '/edge')
  )
}
