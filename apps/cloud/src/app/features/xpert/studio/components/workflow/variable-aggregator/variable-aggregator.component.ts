import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { FFlowModule } from '@foblex/flow'
import { PlusSvgComponent } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import {
  AiModelTypeEnum,
  IWFNVariableAggregator,
  IWorkflowNode,
  TXpertTeamNode,
  WorkflowNodeTypeEnum,
  XpertAgentExecutionStatusEnum
} from 'apps/cloud/src/app/@core'
import { XpertStudioApiService } from '../../../domain'

@Component({
  selector: 'xpert-workflow-node-variable-aggregator',
  templateUrl: './variable-aggregator.component.html',
  styleUrls: ['./variable-aggregator.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FFlowModule, FormsModule, MatTooltipModule, TranslateModule, PlusSvgComponent]
})
export class XpertWorkflowNodeVariableAggregatorComponent {
  eXpertAgentExecutionEnum = XpertAgentExecutionStatusEnum
  eWorkflowNodeTypeEnum = WorkflowNodeTypeEnum
  eModelType = AiModelTypeEnum

  readonly elementRef = inject(ElementRef)
  readonly studioService = inject(XpertStudioApiService)

  // Inputs
  readonly node = input<TXpertTeamNode>()
  readonly entity = input<IWorkflowNode>()

  // States
  readonly variableAggregator = computed(() => this.entity() as IWFNVariableAggregator)
  readonly outputType = computed(() => this.variableAggregator()?.outputType || '')

  readonly nodes = computed(() => this.studioService.viewModel().nodes)
  readonly canBeConnectedInputs = computed(() =>
    this.nodes()
      .filter((_) => _.type === 'agent' || _.type === 'workflow')
      .map((_) => (_.type === 'workflow' ? _.key + '/edge' : _.key))
  )

  readonly inputs = computed(() => this.variableAggregator()?.inputs)
}
