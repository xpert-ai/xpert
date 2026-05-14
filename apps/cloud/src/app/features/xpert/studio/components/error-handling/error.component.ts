import { ChangeDetectionStrategy, Component, ElementRef, inject, input } from '@angular/core'
import { FFlowModule } from '@foblex/flow'
import { TranslateModule } from '@ngx-translate/core'
import {
  AiModelTypeEnum,
  TErrorHandling,
  TXpertTeamNode,
  WorkflowNodeTypeEnum,
  XpertAgentExecutionStatusEnum
} from 'apps/cloud/src/app/@core'
import { PlusSvgComponent, ZardTooltipImports } from '@xpert-ai/headless-ui'

@Component({
  selector: 'xpert-node-error-handling',
  templateUrl: './error.component.html',
  styleUrls: ['./error.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FFlowModule, ...ZardTooltipImports, TranslateModule, PlusSvgComponent]
})
export class XpertNodeErrorHandlingComponent {
  eXpertAgentExecutionEnum = XpertAgentExecutionStatusEnum
  eWorkflowNodeTypeEnum = WorkflowNodeTypeEnum
  eModelType = AiModelTypeEnum

  readonly elementRef = inject(ElementRef)

  // Inputs
  readonly node = input<TXpertTeamNode>()
  readonly errorHandling = input<TErrorHandling>()

  // States
}
