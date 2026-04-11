import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input } from '@angular/core'
import { FFlowModule } from '@foblex/flow'
import { PlusSvgComponent } from '@xpert-ai/ocap-angular/common'
import { NgmI18nPipe } from '@xpert-ai/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import {
  AiModelTypeEnum,
  IWFNTrigger,
  IWorkflowNode,
  TXpertTeamNode,
  WorkflowNodeTypeEnum,
  XpertAgentExecutionStatusEnum
} from 'apps/cloud/src/app/@core'
import { XpertStudioApiService } from '../../../domain'
import { ZardTooltipImports } from '@xpert-ai/headless-ui'

@Component({
  selector: 'xpert-workflow-node-trigger',
  templateUrl: './trigger.component.html',
  styleUrls: ['./trigger.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FFlowModule, ...ZardTooltipImports, TranslateModule, PlusSvgComponent, NgmI18nPipe]
})
export class XpertWorkflowNodeTriggerComponent {
  eXpertAgentExecutionEnum = XpertAgentExecutionStatusEnum
  eWorkflowNodeTypeEnum = WorkflowNodeTypeEnum
  eModelType = AiModelTypeEnum

  readonly elementRef = inject(ElementRef)
  readonly studioService = inject(XpertStudioApiService)

  // Inputs
  readonly node = input<TXpertTeamNode>()
  readonly entity = input<IWorkflowNode>()

  // States
  readonly triggerEntity = computed(() => this.entity() as IWFNTrigger)

  readonly from = computed(() => this.triggerEntity()?.from)
  readonly xpertCopilotModel = computed(() => this.studioService.viewModel()?.team.copilotModel)
  readonly nodes = computed(() => this.studioService.viewModel().nodes)

  readonly canBeConnectedInputs = computed(() =>
    this.nodes()
      .filter((_) => _.type === 'agent' || _.type === 'xpert')
      .map((_) => _.key)
  )

  readonly triggerProviders = this.studioService.triggerProviders

  readonly provider = computed(() => this.triggerProviders()?.find((item) => item.name === this.from()))
}
