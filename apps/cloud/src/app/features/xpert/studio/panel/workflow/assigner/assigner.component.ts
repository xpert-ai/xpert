import { CdkMenuModule } from '@angular/cdk/menu'
import { CommonModule } from '@angular/common'
import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { StateVariableSelectComponent } from '@cloud/app/@shared/agent'
import { EmojiAvatarComponent } from '@cloud/app/@shared/avatar'
import { injectConfigureBuiltin } from '@cloud/app/features/xpert/tools'
import { attrModel, linkedModel, NgmI18nPipe } from '@metad/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import {
  AiModelTypeEnum,
  getEnabledTools,
  getToolLabel,
  IToolProvider,
  IWFNAssigner,
  IWFNTool,
  IWorkflowNode,
  IXpertToolset,
  WorkflowNodeTypeEnum,
  XpertAgentExecutionStatusEnum,
  XpertParameterTypeEnum
} from 'apps/cloud/src/app/@core'
import { derivedAsync } from 'ngxtension/derived-async'
import { catchError, of } from 'rxjs'
import { XpertStudioToolsetMenuComponent } from '../../../components/toolset-menu/toolset.component'
import { XpertStudioApiService } from '../../../domain'
import { XpertStudioComponent } from '../../../studio.component'
import { XpertWorkflowBaseComponent } from '../workflow-base.component'
import { XpertMCPManageComponent } from '@cloud/app/@shared/mcp'
import { Dialog } from '@angular/cdk/dialog'
import { XpertWorkflowErrorHandlingComponent } from '@cloud/app/@shared/workflow'
import { XpertVariablesAssignerComponent } from '@cloud/app/@shared/xpert'


@Component({
  selector: 'xpert-workflow-assigner',
  templateUrl: './assigner.component.html',
  styleUrls: ['./assigner.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    CdkMenuModule,
    MatTooltipModule,
    TranslateModule,
    XpertVariablesAssignerComponent
  ]
})
export class XpertWorkflowAssignerComponent extends XpertWorkflowBaseComponent {
  eXpertAgentExecutionEnum = XpertAgentExecutionStatusEnum
  eWorkflowNodeTypeEnum = WorkflowNodeTypeEnum
  eAiModelTypeEnum = AiModelTypeEnum
  eXpertParameterTypeEnum = XpertParameterTypeEnum

  readonly elementRef = inject(ElementRef)
  readonly xpertStudioComponent = inject(XpertStudioComponent)
  readonly studioService = inject(XpertStudioApiService)
  readonly #dialog = inject(Dialog)

  // Inputs
  readonly entity = input<IWorkflowNode>()

  // States
  readonly workspaceId = computed(() => this.xpert()?.workspaceId)

  readonly assignerEntity = linkedModel({
    initialValue: null,
    compute: () => this.entity() as IWFNAssigner,
    update: (value) => {
      this.studioService.updateWorkflowNode(this.key(), (entity) => {
        return value
      })
    }
  })
  
  readonly assigners = attrModel(this.assignerEntity, 'assigners')
}
