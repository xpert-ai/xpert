import { Clipboard, ClipboardModule } from '@angular/cdk/clipboard'
import { Dialog } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { injectConfigureBuiltin } from '@cloud/app/features/xpert/tools'
import { attrModel, linkedModel } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import {
  AiModelTypeEnum,
  IWFNTask,
  IWorkflowNode,
  IXpertAgent,
  WorkflowNodeTypeEnum,
  XpertAgentExecutionStatusEnum,
  XpertParameterTypeEnum,
  XpertToolService
} from 'apps/cloud/src/app/@core'
import { XpertStudioApiService } from '../../../domain'
import { XpertStudioComponent } from '../../../studio.component'
import { XpertWorkflowBaseComponent } from '../workflow-base.component'

@Component({
  selector: 'xpert-workflow-task',
  templateUrl: './task.component.html',
  styleUrls: ['./task.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, ClipboardModule, CdkMenuModule, MatTooltipModule, TranslateModule]
})
export class XpertWorkflowTaskComponent extends XpertWorkflowBaseComponent {
  eXpertAgentExecutionEnum = XpertAgentExecutionStatusEnum
  eWorkflowNodeTypeEnum = WorkflowNodeTypeEnum
  eAiModelTypeEnum = AiModelTypeEnum
  eXpertParameterTypeEnum = XpertParameterTypeEnum

  readonly elementRef = inject(ElementRef)
  readonly xpertStudioComponent = inject(XpertStudioComponent)
  readonly studioService = inject(XpertStudioApiService)
  readonly toolService = inject(XpertToolService)
  readonly #dialog = inject(Dialog)
  readonly #clipboard = inject(Clipboard)
  readonly configureBuiltin = injectConfigureBuiltin()

  // Inputs
  readonly entity = input<IWorkflowNode>()

  // States
  readonly workspaceId = computed(() => this.xpert()?.workspaceId)

  readonly toolEntity = linkedModel({
    initialValue: null,
    compute: () => this.entity() as IWFNTask,
    update: (value) => {
      this.studioService.updateWorkflowNode(this.key(), (entity) => {
        return value
      })
    }
  })

  // Models
  readonly descriptionPrefix = attrModel(this.toolEntity, 'descriptionPrefix')
  readonly descriptionSuffix = attrModel(this.toolEntity, 'descriptionSuffix')

  readonly draft = this.studioService.viewModel
  readonly subAgentNodes = computed(() =>
    this.draft()
      ?.connections.filter((_) => _.type === 'agent' && _.from === this.toolEntity()?.key)
      .map((_) => this.draft()?.nodes.find((node) => node.key === _.to) as { type: 'agent'; entity: IXpertAgent })
  )

  readonly other_agents_string = computed(() =>
    this.subAgentNodes()
      ?.map(({ entity }: { entity: IXpertAgent }) => {
        return `- ${entity.name || entity.key}: ${entity.description || 'No description'}`
      })
      .join('\n')
  )
}
