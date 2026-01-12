import { ChangeDetectionStrategy, Component, computed } from '@angular/core'
import { MatTooltipModule } from '@angular/material/tooltip'
import { IWFNIterating, WorkflowNodeTypeEnum, XpertAgentExecutionStatusEnum } from '@cloud/app/@core'
import { FFlowModule } from '@foblex/flow'
import { TranslateModule } from '@ngx-translate/core'
import { WorkflowBaseNodeComponent } from '../workflow-base.component'
import { PlusSvgComponent } from '@metad/ocap-angular/common'

@Component({
  selector: 'xpert-studio-node-workflow-iterator',
  templateUrl: './iterator.component.html',
  styleUrls: ['./iterator.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FFlowModule, MatTooltipModule, TranslateModule, PlusSvgComponent],
  host: {
    tabindex: '-1'
  }
})
export class XpertStudioNodeWorkflowIteratorComponent extends WorkflowBaseNodeComponent {
  eXpertAgentExecutionEnum = XpertAgentExecutionStatusEnum
  eWorkflowNodeTypeEnum = WorkflowNodeTypeEnum

  // States
  readonly iterating = computed(() => this.entity() as IWFNIterating)
}
