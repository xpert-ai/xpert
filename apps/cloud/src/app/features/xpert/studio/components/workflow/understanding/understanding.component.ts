import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, effect, ElementRef, inject, input } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { MatTooltipModule } from '@angular/material/tooltip'
import { KnowledgebaseService } from '@cloud/app/@core'
import { FFlowModule } from '@foblex/flow'
import { SafePipe } from '@metad/core'
import { PlusSvgComponent } from '@metad/ocap-angular/common'
import { NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import {
  IWFNUnderstanding,
  IWorkflowNode,
  TXpertTeamNode,
  WorkflowNodeTypeEnum,
  XpertAgentExecutionStatusEnum
} from 'apps/cloud/src/app/@core'
import { XpertStudioApiService } from '../../../domain'

@Component({
  selector: 'xpert-workflow-node-understanding',
  templateUrl: './understanding.component.html',
  styleUrls: ['./understanding.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FFlowModule, MatTooltipModule, TranslateModule, SafePipe, PlusSvgComponent, NgmI18nPipe],
  host: {
    tabindex: '-1'
  }
})
export class XpertWorkflowNodeUnderstandingComponent {
  eXpertAgentExecutionEnum = XpertAgentExecutionStatusEnum
  eWorkflowNodeTypeEnum = WorkflowNodeTypeEnum

  readonly elementRef = inject(ElementRef)
  readonly studioService = inject(XpertStudioApiService)
  readonly knowledgebaseService = inject(KnowledgebaseService)

  // Inputs
  readonly node = input<TXpertTeamNode>()
  readonly entity = input<IWorkflowNode>()

  // States
  readonly understandingEntity = computed(() => this.entity() as IWFNUnderstanding)
  readonly provider = computed(() => this.understandingEntity()?.provider)
  readonly config = computed(() => this.understandingEntity()?.config)

  readonly nodes = computed(() => this.studioService.viewModel().nodes)

  readonly canBeConnectedInputs = computed(() =>
    this.nodes()
      .filter((_) => _.type === 'agent' || _.type === 'workflow')
      .map((_) => _.type === 'workflow' ? _.key + '/edge' : _.key)
  )

  // Understanding providers from knowledgebase service
  readonly understandingProviders = toSignal(this.knowledgebaseService.understandingStrategies$, {
    initialValue: []
  })
  readonly understandingProvider = computed(() => {
    const providerName = this.provider()
    if (providerName && this.understandingProviders()) {
      return this.understandingProviders().find((p) => p.meta.name === providerName)?.meta
    }
    return null
  })
}
