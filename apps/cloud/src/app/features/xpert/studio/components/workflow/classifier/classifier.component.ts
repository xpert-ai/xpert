import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input } from '@angular/core'
import { CopilotModelSelectComponent } from '@cloud/app/@shared/copilot'
import { FFlowModule } from '@foblex/flow'
import { PlusSvgComponent } from '@xpert-ai/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import {
  AiModelTypeEnum,
  IWFNClassifier,
  IWorkflowNode,
  TXpertTeamNode,
  WorkflowNodeTypeEnum,
  XpertAgentExecutionStatusEnum
} from 'apps/cloud/src/app/@core'
import { XpertStudioApiService } from '../../../domain'
import { ZardTooltipImports } from '@xpert-ai/headless-ui'

@Component({
  selector: 'xpert-workflow-node-classifier',
  templateUrl: './classifier.component.html',
  styleUrls: ['./classifier.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FFlowModule, ...ZardTooltipImports, TranslateModule, PlusSvgComponent, CopilotModelSelectComponent]
})
export class XpertWorkflowNodeClassifierComponent {
  eXpertAgentExecutionEnum = XpertAgentExecutionStatusEnum
  eWorkflowNodeTypeEnum = WorkflowNodeTypeEnum
  eModelType = AiModelTypeEnum

  readonly elementRef = inject(ElementRef)
  readonly studioService = inject(XpertStudioApiService)

  // Inputs
  readonly node = input<TXpertTeamNode>()
  readonly entity = input<IWorkflowNode>()

  // States
  readonly classifier = computed(() => this.entity() as IWFNClassifier)
  readonly copilotModel = computed(() => this.classifier()?.copilotModel)
  readonly classes = computed(() => this.classifier()?.classes)

  readonly xpertCopilotModel = computed(() => this.studioService.viewModel()?.team.copilotModel)
  readonly nodes = computed(() => this.studioService.viewModel().nodes)

  readonly canBeConnectedInputs = computed(() =>
    this.nodes()
      .filter((_) => _.type === 'agent' || _.type === 'xpert')
      .map((_) => _.key)
  )
}
