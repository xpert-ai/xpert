import { Clipboard, ClipboardModule } from '@angular/cdk/clipboard'
import { Dialog } from '@angular/cdk/dialog'
import { CdkMenuModule } from '@angular/cdk/menu'

import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { StateVariableSelectComponent } from '@cloud/app/@shared/agent'
import { CopilotPromptEditorComponent } from '@cloud/app/@shared/copilot'
import { XpertOutputVariablesEditComponent } from '@cloud/app/@shared/xpert'
import { injectConfigureBuiltin } from '@cloud/app/features/xpert/tools'
import { attrModel, linkedModel, NgmDensityDirective } from '@xpert-ai/ocap-angular/core'
import { TranslateModule } from '@ngx-translate/core'
import {
  AiModelTypeEnum,
  IWFNAgentWorkflow,
  IWorkflowNode,
  TAgentToolReturnSource,
  WorkflowNodeTypeEnum,
  XpertAgentExecutionStatusEnum,
  XpertParameterTypeEnum,
  XpertToolService
} from 'apps/cloud/src/app/@core'
import { XpertStudioApiService } from '../../../domain'
import { XpertStudioComponent } from '../../../studio.component'
import { XpertWorkflowBaseComponent } from '../workflow-base.component'
import {
  ZardSegmentedComponent,
  ZardSegmentedItemComponent,
  ZardSwitchComponent,
  ZardTooltipImports
} from '@xpert-ai/headless-ui'

type TAgentToolReturnSourceType = TAgentToolReturnSource['type']

@Component({
  selector: 'xpert-workflow-agent-tool',
  templateUrl: './tool.component.html',
  styleUrls: ['./tool.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    ClipboardModule,
    CdkMenuModule,
    ...ZardTooltipImports,
    TranslateModule,
    NgmDensityDirective,
    CopilotPromptEditorComponent,
    XpertOutputVariablesEditComponent,
    StateVariableSelectComponent,
    ZardSegmentedComponent,
    ZardSegmentedItemComponent,
    ZardSwitchComponent
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
    compute: () => this.entity() as IWFNAgentWorkflow,
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
  readonly returnSource = attrModel(this.toolEntity, 'returnSource')
  readonly returnSourceType = computed<TAgentToolReturnSourceType>(() => this.returnSource()?.type ?? 'last_message')
  readonly returnVariable = computed(() => {
    const source = this.returnSource()
    return source?.type === 'variable' ? source.variableSelector : null
  })
  readonly returnTemplate = computed(() => {
    const source = this.returnSource()
    return source?.type === 'template' ? source.template : ''
  })
  // readonly errorHandling = attrModel(this.toolEntity, 'errorHandling')

  updateReturnSourceType(type: TAgentToolReturnSourceType) {
    if (type === 'variable') {
      this.returnSource.set({
        type,
        variableSelector: this.returnVariable() ?? ''
      })
      return
    }

    if (type === 'template') {
      this.returnSource.set({
        type,
        template: this.returnTemplate() ?? ''
      })
      return
    }

    this.returnSource.set({
      type: 'last_message'
    })
  }

  updateReturnVariable(variableSelector: string) {
    this.returnSource.set({
      type: 'variable',
      variableSelector
    })
  }

  updateReturnTemplate(template: string) {
    this.returnSource.set({
      type: 'template',
      template
    })
  }
}
