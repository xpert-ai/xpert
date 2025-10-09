import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input } from '@angular/core'
import { MatTooltipModule } from '@angular/material/tooltip'
import { FFlowModule } from '@foblex/flow'
import { PlusSvgComponent } from '@metad/ocap-angular/common'
import { NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import {
  IWFNProcessor,
  IWorkflowNode,
  TXpertTeamNode,
  WorkflowNodeTypeEnum,
  XpertAgentExecutionStatusEnum
} from 'apps/cloud/src/app/@core'
import { KnowledgebaseService } from '@cloud/app/@core'
import { toSignal } from '@angular/core/rxjs-interop'
import { CommonModule } from '@angular/common'
import { CustomIconComponent } from '@cloud/app/@shared/avatar'
import { XpertStudioApiService } from '../../../domain'

@Component({
  selector: 'xpert-workflow-node-processor',
  templateUrl: './processor.component.html',
  styleUrls: ['./processor.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FFlowModule,
    MatTooltipModule,
    TranslateModule,
    PlusSvgComponent,
    NgmI18nPipe,
    CustomIconComponent
  ],
  host: {
    tabindex: '-1'
  }
})
export class XpertWorkflowNodeProcessorComponent {
  eXpertAgentExecutionEnum = XpertAgentExecutionStatusEnum
  eWorkflowNodeTypeEnum = WorkflowNodeTypeEnum

  readonly elementRef = inject(ElementRef)
  readonly studioService = inject(XpertStudioApiService)
  readonly knowledgebaseService = inject(KnowledgebaseService)

  // Inputs
  readonly node = input<TXpertTeamNode>()
  readonly entity = input<IWorkflowNode>()

  // States
  readonly processorEntity = computed(() => this.entity() as IWFNProcessor)
  readonly provider = computed(() => this.processorEntity()?.provider)
  readonly config = computed(() => this.processorEntity()?.config)

  readonly nodes = computed(() => this.studioService.viewModel().nodes)

  readonly canBeConnectedInputs = computed(() =>
    this.nodes()
      .filter((_) => _.type === 'agent' || _.type === 'workflow')
      .map((_) => _.type === 'workflow' ? _.key + '/edge' : _.key)
  )

  // Processor providers from knowledgebase service
  readonly processorProviders = toSignal(this.knowledgebaseService.documentTransformerStrategies$, { initialValue: [] })
  readonly processorProvider = computed(() => {
    const providerName = this.provider()
    if (providerName && this.processorProviders()) {
      return this.processorProviders().find(p => p.meta.name === providerName)
    }
    return null
  })
}