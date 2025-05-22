import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input } from '@angular/core'
import { MatTooltipModule } from '@angular/material/tooltip'
import {
  IWFNIterating,
  IWorkflowNode,
  TXpertTeamNode,
  WorkflowNodeTypeEnum,
  XpertAgentExecutionStatusEnum
} from '@cloud/app/@core'
import { FFlowModule } from '@foblex/flow'
import { PlusSvgComponent } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import { XpertStudioApiService } from '../../../domain'

@Component({
  selector: 'xpert-studio-node-workflow-iterating',
  templateUrl: './iterating.component.html',
  styleUrls: ['./iterating.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FFlowModule, MatTooltipModule, TranslateModule, PlusSvgComponent],
  host: {
    tabindex: '-1'
  }
})
export class XpertStudioNodeWorkflowIteratingComponent {
  eXpertAgentExecutionEnum = XpertAgentExecutionStatusEnum
  eWorkflowNodeTypeEnum = WorkflowNodeTypeEnum

  readonly elementRef = inject(ElementRef)
  readonly studioService = inject(XpertStudioApiService)

  // Inputs
  readonly node = input<TXpertTeamNode>()
  readonly entity = input<IWorkflowNode>()

  // States
  readonly iterating = computed(() => this.entity() as IWFNIterating)
  readonly nodes = computed(() => this.studioService.viewModel().nodes)

  readonly canBeConnectedInputs = computed(() =>
    this.nodes()
      .filter((_) => _.type === 'agent' || _.type === 'xpert')
      .map((_) => _.key)
  )
}
