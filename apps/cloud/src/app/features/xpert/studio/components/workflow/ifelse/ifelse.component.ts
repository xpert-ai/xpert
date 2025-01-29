import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input } from '@angular/core'
import { MatTooltipModule } from '@angular/material/tooltip'
import { FFlowModule } from '@foblex/flow'
import { PlusSvgComponent } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import {
  IWFNIfElse,
  IWorkflowNode,
  TXpertTeamNode,
  WorkflowNodeTypeEnum,
  XpertAgentExecutionStatusEnum
} from 'apps/cloud/src/app/@core'
import { XpertWorkflowCaseComponent } from 'apps/cloud/src/app/@shared/workflow'
import { XpertStudioApiService } from '../../../domain'

@Component({
  selector: 'xpert-studio-node-workflow-ifelse',
  templateUrl: './ifelse.component.html',
  styleUrls: ['./ifelse.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FFlowModule, MatTooltipModule, TranslateModule, PlusSvgComponent, XpertWorkflowCaseComponent],
  host: {
    tabindex: '-1'
  }
})
export class XpertStudioNodeWorkflowIfelseComponent {
  eXpertAgentExecutionEnum = XpertAgentExecutionStatusEnum
  eWorkflowNodeTypeEnum = WorkflowNodeTypeEnum

  readonly elementRef = inject(ElementRef)
  readonly apiService = inject(XpertStudioApiService)

  // Inputs
  readonly node = input<TXpertTeamNode>()
  readonly entity = input<IWorkflowNode>()

  // States
  readonly ifElseEntity = computed(() => this.entity() as IWFNIfElse)
  readonly cases = computed(() => this.ifElseEntity()?.cases)
}
