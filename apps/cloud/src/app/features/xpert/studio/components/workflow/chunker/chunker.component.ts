import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input } from '@angular/core'
import { MatTooltipModule } from '@angular/material/tooltip'
import { FFlowModule } from '@foblex/flow'
import { PlusSvgComponent } from '@metad/ocap-angular/common'
import { NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import {
  IWFNChunker,
  IWorkflowNode,
  TXpertTeamNode,
  WorkflowNodeTypeEnum,
  XpertAgentExecutionStatusEnum
} from 'apps/cloud/src/app/@core'
import { KnowledgebaseService } from '@cloud/app/@core'
import { XpertStudioApiService } from '../../../domain'
import { toSignal } from '@angular/core/rxjs-interop'
import { CommonModule } from '@angular/common'
import { CustomIconComponent } from '@cloud/app/@shared/avatar'

@Component({
  selector: 'xpert-workflow-node-chunker',
  templateUrl: './chunker.component.html',
  styleUrls: ['./chunker.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FFlowModule,
    MatTooltipModule,
    TranslateModule,
    CustomIconComponent,
    PlusSvgComponent,
    NgmI18nPipe,
  ],
  host: {
    tabindex: '-1'
  }
})
export class XpertWorkflowNodeChunkerComponent {
  eXpertAgentExecutionEnum = XpertAgentExecutionStatusEnum
  eWorkflowNodeTypeEnum = WorkflowNodeTypeEnum

  readonly elementRef = inject(ElementRef)
  readonly studioService = inject(XpertStudioApiService)
  readonly knowledgebaseService = inject(KnowledgebaseService)

  // Inputs
  readonly node = input<TXpertTeamNode>()
  readonly entity = input<IWorkflowNode>()

  // States
  readonly chunkerEntity = computed(() => this.entity() as IWFNChunker)
  readonly provider = computed(() => this.chunkerEntity()?.provider)
  readonly config = computed(() => this.chunkerEntity()?.config)

  readonly nodes = computed(() => this.studioService.viewModel().nodes)

  readonly canBeConnectedInputs = computed(() =>
    this.nodes()
      .filter((_) => _.type === 'agent' || _.type === 'workflow')
      .map((_) => _.type === 'workflow' ? _.key + '/edge' : _.key)
  )

  // Chunker providers from knowledgebase service
  readonly chunkerProviders = toSignal(this.knowledgebaseService.textSplitterStrategies$, { initialValue: [] })
  readonly chunkerProvider = computed(() => {
    const providerName = this.provider()
    if (providerName && this.chunkerProviders()) {
      return this.chunkerProviders().find(p => p.name === providerName)
    }
    return null
  })
}