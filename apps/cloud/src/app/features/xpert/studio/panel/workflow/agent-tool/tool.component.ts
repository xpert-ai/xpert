import { Clipboard, ClipboardModule } from '@angular/cdk/clipboard'
import { Dialog } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatSlideToggleModule } from '@angular/material/slide-toggle'
import { MatTooltipModule } from '@angular/material/tooltip'
import { XpertWorkflowErrorHandlingComponent } from '@cloud/app/@shared/workflow'
import { XpertOutputVariablesEditComponent } from '@cloud/app/@shared/xpert'
import { injectConfigureBuiltin } from '@cloud/app/features/xpert/tools'
import { attrModel, linkedModel, NgmDensityDirective } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import {
  AiModelTypeEnum,
  IWFNAgentTool,
  IWorkflowNode,
  WorkflowNodeTypeEnum,
  XpertAgentExecutionStatusEnum,
  XpertParameterTypeEnum,
  XpertToolService
} from 'apps/cloud/src/app/@core'
import { XpertStudioApiService } from '../../../domain'
import { XpertStudioComponent } from '../../../studio.component'
import { XpertWorkflowBaseComponent } from '../workflow-base.component'

@Component({
  selector: 'xpert-workflow-agent-tool',
  templateUrl: './tool.component.html',
  styleUrls: ['./tool.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    ClipboardModule,
    CdkMenuModule,
    MatTooltipModule,
    MatSlideToggleModule,
    TranslateModule,
    NgmDensityDirective,
    XpertOutputVariablesEditComponent,
    XpertWorkflowErrorHandlingComponent
  ]
})
export class XpertWorkflowAgentToolComponent extends XpertWorkflowBaseComponent {
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
    compute: () => this.entity() as IWFNAgentTool,
    update: (value) => {
      this.studioService.updateWorkflowNode(this.key(), (entity) => {
        return value
      })
    }
  })

  // Models
  readonly toolName = attrModel(this.toolEntity, 'toolName')
  readonly toolDescription = attrModel(this.toolEntity, 'toolDescription')
  readonly parameters = attrModel(this.toolEntity, 'toolParameters')
  readonly isEnd = attrModel(this.toolEntity, 'isEnd')
  // readonly errorHandling = attrModel(this.toolEntity, 'errorHandling')

  // constructor() {
  //   super()
  // }
}
