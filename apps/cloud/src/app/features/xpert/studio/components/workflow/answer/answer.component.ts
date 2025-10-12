import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input } from '@angular/core'
import { MatTooltipModule } from '@angular/material/tooltip'
import { FFlowModule } from '@foblex/flow'
import { PlusSvgComponent } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import {
  IWFNAnswer,
  IWorkflowNode,
  TXpertTeamNode,
  WorkflowNodeTypeEnum,
  XpertAgentExecutionStatusEnum
} from 'apps/cloud/src/app/@core'
import { XpertStudioApiService } from '../../../domain'
import { WorkflowBaseNodeComponent } from '../workflow-base.component'

@Component({
  selector: 'xpert-studio-node-workflow-answer',
  templateUrl: './answer.component.html',
  styleUrls: ['./answer.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FFlowModule, MatTooltipModule, TranslateModule, PlusSvgComponent],
  host: {
    tabindex: '-1'
  }
})
export class XpertStudioNodeWorkflowAnswerComponent extends WorkflowBaseNodeComponent {

  // States
  readonly answerEntity = computed(() => this.entity() as IWFNAnswer)
  readonly promptTemplate = computed(() => this.answerEntity()?.promptTemplate)
  
}
