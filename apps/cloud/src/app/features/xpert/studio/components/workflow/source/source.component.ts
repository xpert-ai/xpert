import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input } from '@angular/core'
import { MatTooltipModule } from '@angular/material/tooltip'
import { FFlowModule } from '@foblex/flow'
import { PlusSvgComponent } from '@metad/ocap-angular/common'
import { NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import {
  IWFNSource,
  IWorkflowNode,
  TXpertTeamNode,
  WorkflowNodeTypeEnum,
  XpertAgentExecutionStatusEnum
} from 'apps/cloud/src/app/@core'
import { XpertStudioApiService } from '../../../domain'

@Component({
  selector: 'xpert-workflow-node-source',
  templateUrl: './source.component.html',
  styleUrls: ['./source.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FFlowModule, MatTooltipModule, TranslateModule, PlusSvgComponent, NgmI18nPipe]
})
export class XpertWorkflowNodeSourceComponent {
  eXpertAgentExecutionEnum = XpertAgentExecutionStatusEnum
  eWorkflowNodeTypeEnum = WorkflowNodeTypeEnum

  readonly elementRef = inject(ElementRef)
  readonly studioService = inject(XpertStudioApiService)

  // Inputs
  readonly node = input<TXpertTeamNode>()
  readonly entity = input<IWorkflowNode>()

  // States
  readonly sourceEntity = computed(() => this.entity() as IWFNSource)
  
  readonly provider = computed(() => this.sourceEntity()?.provider)
  readonly sourceConfig = computed(() => this.sourceEntity()?.config)
  readonly nodes = computed(() => this.studioService.viewModel().nodes)

 
}