import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input } from '@angular/core'
import { FFlowModule } from '@foblex/flow'
import { PlusSvgComponent } from '@xpert-ai/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import {
  IWFNAnswer,
  IWFNCode,
  IWorkflowNode,
  TXpertTeamNode,
  WorkflowNodeTypeEnum,
  XpertAgentExecutionStatusEnum
} from 'apps/cloud/src/app/@core'
import { XpertStudioApiService } from '../../../domain'
import { XpertNodeErrorHandlingComponent } from '../../error-handling/error.component'
import { ZardTooltipImports } from '@xpert-ai/headless-ui'

@Component({
  selector: 'xpert-studio-node-workflow-code',
  templateUrl: './code.component.html',
  styleUrls: ['./code.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FFlowModule, ...ZardTooltipImports, TranslateModule, PlusSvgComponent, XpertNodeErrorHandlingComponent],
  host: {
    tabindex: '-1'
  }
})
export class XpertStudioNodeWorkflowCodeComponent {
  eXpertAgentExecutionEnum = XpertAgentExecutionStatusEnum
  eWorkflowNodeTypeEnum = WorkflowNodeTypeEnum

  readonly elementRef = inject(ElementRef)
  readonly apiService = inject(XpertStudioApiService)

  // Inputs
  readonly node = input<TXpertTeamNode>()
  readonly entity = input<IWorkflowNode>()

  // States
  readonly codeEntity = computed(() => this.entity() as IWFNCode)
  readonly code = computed(() => this.codeEntity()?.code)
  readonly retry = computed(() => this.codeEntity()?.retry)
  readonly errorHandling = computed(() => this.codeEntity()?.errorHandling)
}
