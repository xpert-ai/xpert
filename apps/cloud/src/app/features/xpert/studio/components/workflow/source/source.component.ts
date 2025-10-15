import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'
import { MatTooltipModule } from '@angular/material/tooltip'
import { FFlowModule } from '@foblex/flow'
import { PlusSvgComponent } from '@metad/ocap-angular/common'
import { NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import {
  IWFNSource,
  IWorkflowNode,
  KnowledgebaseService,
  TXpertTeamNode,
  WorkflowNodeTypeEnum,
  XpertAgentExecutionStatusEnum
} from 'apps/cloud/src/app/@core'
import { XpertStudioApiService } from '../../../domain'
import { IconComponent } from '@cloud/app/@shared/avatar'

@Component({
  selector: 'xpert-workflow-node-source',
  templateUrl: './source.component.html',
  styleUrls: ['./source.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FFlowModule,
    MatTooltipModule,
    TranslateModule,
    PlusSvgComponent,
    NgmI18nPipe,
    IconComponent
  ]
})
export class XpertWorkflowNodeSourceComponent {
  eXpertAgentExecutionEnum = XpertAgentExecutionStatusEnum
  eWorkflowNodeTypeEnum = WorkflowNodeTypeEnum

  readonly elementRef = inject(ElementRef)
  readonly studioService = inject(XpertStudioApiService)
  readonly knowledgebaseAPI = inject(KnowledgebaseService)

  // Inputs
  readonly node = input<TXpertTeamNode>()
  readonly entity = input<IWorkflowNode>()

  // States
  readonly sourceEntity = computed(() => this.entity() as IWFNSource)

  readonly provider = computed(() => this.sourceEntity()?.provider)
  readonly sourceConfig = computed(() => this.sourceEntity()?.config)
  readonly nodes = computed(() => this.studioService.viewModel().nodes)

  readonly sourceStrategies = toSignal(this.knowledgebaseAPI.documentSourceStrategies$)

  readonly sourceProvider = computed(() => {
    const providerName = this.provider()
    return providerName && this.sourceStrategies()?.find((p) => p.meta.name === providerName)
  })

  readonly canBeConnectedInputs = computed(() =>
    this.nodes()
      .filter((_) => _.type === 'agent' || _.type === 'workflow')
      .map((_) => _.type === 'workflow' ? _.key + '/edge' : _.key)
  )
}
