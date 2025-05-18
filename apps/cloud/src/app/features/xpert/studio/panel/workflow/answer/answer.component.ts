import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { TranslateModule } from '@ngx-translate/core'
import {
  injectToastr,
  IWFNAnswer,
  IWorkflowNode,
  WorkflowNodeTypeEnum,
  XpertAgentExecutionStatusEnum,
  XpertService
} from 'apps/cloud/src/app/@core'
import { CopilotPromptEditorComponent } from 'apps/cloud/src/app/@shared/copilot'
import { XpertStudioApiService } from '../../../domain'
import { XpertStudioComponent } from '../../../studio.component'
import { XpertWorkflowBaseComponent } from '../workflow-base.component'

@Component({
  selector: 'xpert-studio-panel-workflow-answer',
  templateUrl: './answer.component.html',
  styleUrls: ['./answer.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, MatTooltipModule, TranslateModule, CopilotPromptEditorComponent],
  host: {
    tabindex: '-1'
  }
})
export class XpertStudioPanelWorkflowAnswerComponent extends XpertWorkflowBaseComponent {
  eXpertAgentExecutionEnum = XpertAgentExecutionStatusEnum
  eWorkflowNodeTypeEnum = WorkflowNodeTypeEnum

  readonly elementRef = inject(ElementRef)
  readonly xpertStudioComponent = inject(XpertStudioComponent)
  readonly studioService = inject(XpertStudioApiService)
  readonly xpertService = inject(XpertService)
  readonly #toastr = injectToastr()

  // Inputs
  readonly entity = input<IWorkflowNode>()

  // States
  readonly workspaceId = computed(() => this.xpert()?.workspaceId)
  readonly answerEntity = computed(() => this.entity() as IWFNAnswer)
  readonly promptTemplate = computed(() => this.answerEntity()?.promptTemplate)

  updateEntity(name: string, value: string | number) {
    const entity = { ...(this.answerEntity() ?? {}) } as IWFNAnswer
    entity[name] = value
    this.studioService.updateBlock(this.key(), { entity })
  }
}
