import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input } from '@angular/core'
import { MatTooltipModule } from '@angular/material/tooltip'
import { TranslateModule } from '@ngx-translate/core'
import {
  injectToastr,
  IWFNIterating,
  IWorkflowNode,
  TXpertTeamNode,
  WorkflowNodeTypeEnum,
  XpertAgentExecutionStatusEnum,
  XpertService
} from 'apps/cloud/src/app/@core'
import { XpertStudioApiService } from '../../../domain'
import { XpertStudioComponent } from '../../../studio.component'

@Component({
  selector: 'xpert-studio-panel-workflow-iterating',
  templateUrl: './iterating.component.html',
  styleUrls: ['./iterating.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatTooltipModule, TranslateModule],
  host: {
    tabindex: '-1'
  }
})
export class XpertStudioPanelWorkflowIteratingComponent {
  eXpertAgentExecutionEnum = XpertAgentExecutionStatusEnum
  eWorkflowNodeTypeEnum = WorkflowNodeTypeEnum

  readonly elementRef = inject(ElementRef)
  readonly xpertStudioComponent = inject(XpertStudioComponent)
  readonly studioService = inject(XpertStudioApiService)
  readonly xpertService = inject(XpertService)
  readonly #toastr = injectToastr()

  // Inputs
  readonly node = input<TXpertTeamNode>()
  readonly entity = input<IWorkflowNode>()

  // States
  readonly key = computed(() => this.node()?.key)
  readonly xpert = this.xpertStudioComponent.xpert
  readonly xpertId = computed(() => this.xpert()?.id)
  readonly workspaceId = computed(() => this.xpert()?.workspaceId)
  readonly iteratingEntity = computed(() => this.entity() as IWFNIterating)
}
