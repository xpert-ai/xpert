import { Clipboard } from '@angular/cdk/clipboard'
import { Dialog } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { XpertParametersEditComponent } from '@cloud/app/@shared/xpert'
import { linkedModel } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import {
  AiModelTypeEnum,
  IWFNTrigger,
  IWorkflowNode,
  WorkflowNodeTypeEnum,
  XpertAgentExecutionStatusEnum,
  XpertParameterTypeEnum,
  XpertService,
  XpertToolService
} from 'apps/cloud/src/app/@core'
import { XpertStudioApiService } from '../../../domain'
import { XpertStudioComponent } from '../../../studio.component'
import { XpertWorkflowBaseComponent } from '../workflow-base.component'

@Component({
  selector: 'xpert-workflow-trigger',
  templateUrl: './trigger.component.html',
  styleUrls: ['./trigger.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, CdkMenuModule, MatTooltipModule, TranslateModule, XpertParametersEditComponent]
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
  readonly xpertAPI = inject(XpertService)
  readonly #dialog = inject(Dialog)
  readonly #clipboard = inject(Clipboard)

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
      this.triggerEntity.update((state) => {
        from = state.from
        return {
          ...state,
          parameters: value
        }
      })
      if (from === 'chat') {
        this.studioService.agentConfig.update((state) => {
          return {
            ...(state ?? {}),
            parameters: value
          }
        })
      }
    }
  })
}
