import { CdkMenuModule } from '@angular/cdk/menu'

import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { XpertParametersEditComponent } from '@cloud/app/@shared/xpert'
import { attrModel, linkedModel } from '@xpert-ai/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import {
  AiModelTypeEnum,
  IWFNTrigger,
  IWorkflowNode,
  WorkflowNodeTypeEnum,
  XpertAgentExecutionStatusEnum,
  XpertParameterTypeEnum,
  XpertAPIService,
  XpertToolService
} from 'apps/cloud/src/app/@core'
import { XpertStudioApiService } from '../../../domain'
import { XpertStudioComponent } from '../../../studio.component'
import { XpertWorkflowBaseComponent } from '../workflow-base.component'
import { JSONSchemaFormComponent } from '@cloud/app/@shared/forms'
import { ZardTooltipImports } from '@xpert-ai/headless-ui'
import { createChatTriggerInputParameters } from '../../../../draft'

@Component({
  selector: 'xpert-workflow-trigger',
  templateUrl: './trigger.component.html',
  styleUrls: ['./trigger.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    CdkMenuModule,
    ...ZardTooltipImports,
    TranslateModule,
    JSONSchemaFormComponent,
    XpertParametersEditComponent
]
})
export class XpertWorkflowTriggerComponent extends XpertWorkflowBaseComponent {
  eXpertAgentExecutionEnum = XpertAgentExecutionStatusEnum
  eWorkflowNodeTypeEnum = WorkflowNodeTypeEnum
  eAiModelTypeEnum = AiModelTypeEnum
  eXpertParameterTypeEnum = XpertParameterTypeEnum

  readonly elementRef = inject(ElementRef)
  readonly xpertStudioComponent = inject(XpertStudioComponent)
  readonly studioService = inject(XpertStudioApiService)
  readonly toolService = inject(XpertToolService)
  readonly xpertAPI = inject(XpertAPIService)

  // Inputs
  readonly entity = input<IWorkflowNode>()

  // States
  readonly workspaceId = computed(() => this.xpert()?.workspaceId)

  readonly triggerEntity = linkedModel({
    initialValue: null,
    compute: () => this.entity() as IWFNTrigger,
    update: (value) => {
      this.studioService.updateWorkflowNode(this.key(), () => value)
    }
  })

  readonly parameters = linkedModel({
    initialValue: null,
    compute: () => this.triggerEntity().parameters,
    update: (value) => {
      let from = null
      let triggerKey = null
      this.triggerEntity.update((state) => {
        from = state.from
        triggerKey = state.key
        return {
          ...state,
          parameters: value
        }
      })
      if (from === 'chat') {
        this.studioService.updateXpertAgentConfig({
          parameters: createChatTriggerInputParameters(triggerKey, value)
        })
      }
    }
  })

  readonly config = attrModel(this.triggerEntity, 'config')
  readonly from = computed(() => this.triggerEntity()?.from)
  readonly triggerProviders = this.studioService.triggerProviders
  readonly provider = computed(() => this.triggerProviders()?.find((item) => item.name === this.from()))
}
