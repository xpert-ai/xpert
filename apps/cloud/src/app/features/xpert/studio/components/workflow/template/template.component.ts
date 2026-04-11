import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input } from '@angular/core'
import { FFlowModule } from '@foblex/flow'
import { PlusSvgComponent } from '@xpert-ai/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import {
  IWFNTemplate,
  IWorkflowNode,
  TXpertTeamNode,
  WorkflowNodeTypeEnum,
  XpertAgentExecutionStatusEnum
} from 'apps/cloud/src/app/@core'
import { XpertStudioApiService } from '../../../domain'
import { ZardTooltipImports } from '@xpert-ai/headless-ui'

@Component({
  selector: 'xpert-workflow-node-template',
  templateUrl: './template.component.html',
  styleUrls: ['./template.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FFlowModule, ...ZardTooltipImports, TranslateModule, PlusSvgComponent],
  host: {
    tabindex: '-1'
  }
})
export class XpertWorkflowNodeTemplateComponent {
  eXpertAgentExecutionEnum = XpertAgentExecutionStatusEnum
  eWorkflowNodeTypeEnum = WorkflowNodeTypeEnum

  readonly elementRef = inject(ElementRef)
  readonly studioService = inject(XpertStudioApiService)

  // Inputs
  readonly node = input<TXpertTeamNode>()
  readonly entity = input<IWorkflowNode>()

  // States
  readonly template = computed(() => this.entity() as IWFNTemplate)

  readonly inputParams = computed(() => this.template()?.inputParams)
  readonly code = computed(() => this.template()?.code)

  readonly nodes = computed(() => this.studioService.viewModel().nodes)

  readonly canBeConnectedInputs = computed(() =>
    this.nodes()
      .filter((_) => _.type === 'agent' || _.type === 'xpert')
      .map((_) => _.key)
  )
}
