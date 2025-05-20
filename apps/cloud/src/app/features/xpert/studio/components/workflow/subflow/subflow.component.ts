import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { MatTooltipModule } from '@angular/material/tooltip'
import { FFlowModule } from '@foblex/flow'
import { PlusSvgComponent } from '@metad/ocap-angular/common'
import { TranslateModule } from '@ngx-translate/core'
import {
  IWFNKnowledgeRetrieval,
  IWorkflowNode,
  TXpertTeamNode,
  WorkflowNodeTypeEnum,
  XpertAgentExecutionStatusEnum
} from 'apps/cloud/src/app/@core'
import { XpertStudioApiService } from '../../../domain'

@Component({
  selector: 'xpert-workflow-node-subflow',
  templateUrl: './subflow.component.html',
  styleUrls: ['./subflow.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FFlowModule, MatTooltipModule, TranslateModule, PlusSvgComponent],
  host: {
    tabindex: '-1'
  }
})
export class XpertWorkflowNodeSubflowComponent {
  eXpertAgentExecutionEnum = XpertAgentExecutionStatusEnum
  eWorkflowNodeTypeEnum = WorkflowNodeTypeEnum

  readonly elementRef = inject(ElementRef)
  readonly studioService = inject(XpertStudioApiService)

  // Inputs
  readonly node = input<TXpertTeamNode>()
  readonly entity = input<IWorkflowNode>()

  // States
  readonly knowledgeRetrieval = computed(() => this.entity() as IWFNKnowledgeRetrieval)

  readonly knowledgebases = computed(() => this.knowledgeRetrieval()?.knowledgebases)
  readonly knowledgebaseList = toSignal(this.studioService.knowledgebases$)
  readonly selectedKnowledgebases = computed(() => {
    return this.knowledgebases()?.map((id) => ({
      id,
      kb: this.knowledgebaseList()?.find((_) => _.id === id)
    }))
  })
}
