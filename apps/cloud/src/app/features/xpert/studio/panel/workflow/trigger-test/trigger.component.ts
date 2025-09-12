import { CommonModule } from '@angular/common'
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  model,
  output,
  signal
} from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { ChatConversationPreviewComponent } from '@cloud/app/@shared/chat'
import { TranslateModule } from '@ngx-translate/core'
import {
  AiModelTypeEnum,
  IChatMessage,
  injectToastr,
  IWFNTrigger,
  IWorkflowNode,
  WorkflowNodeTypeEnum,
  XpertAgentExecutionStatusEnum,
  XpertParameterTypeEnum
} from 'apps/cloud/src/app/@core'
import { XpertExecutionService } from '../../../services/execution.service'
import { processEvents } from '../../agent-execution/execution.component'
import { XpertWorkflowBaseComponent } from '../workflow-base.component'

@Component({
  selector: 'xpert-workflow-trigger-test',
  templateUrl: './trigger.component.html',
  styleUrls: ['./trigger.component.scss'],
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, MatTooltipModule, TranslateModule, ChatConversationPreviewComponent]
})
export class XpertWorkflowTriggerTestComponent extends XpertWorkflowBaseComponent {
  eXpertAgentExecutionEnum = XpertAgentExecutionStatusEnum
  eWorkflowNodeTypeEnum = WorkflowNodeTypeEnum
  eAiModelTypeEnum = AiModelTypeEnum
  eXpertParameterTypeEnum = XpertParameterTypeEnum

  readonly elementRef = inject(ElementRef)
  readonly #toastr = injectToastr()
  readonly executionService = inject(XpertExecutionService)

  // Inputs
  readonly entity = input<IWorkflowNode>()

  // Outputs
  readonly execution = output<string>()
  readonly closed = output()

  // States
  readonly triggerEntity = computed(() => this.entity() as IWFNTrigger)
  readonly parameters = computed(() => this.triggerEntity()?.parameters)
  readonly from = computed(() => this.triggerEntity()?.from)
  // Models
  readonly conversationId = model<string>(null)
  readonly conversations = signal<string[]>([null])
  readonly messages = model<IChatMessage[]>()
  readonly currentMessage = model<IChatMessage>()

  readonly envriments = signal(false)

  readonly xpert = this.xpertStudioComponent.xpert
  readonly environmentId = this.studioService.environmentId

  onChatEvent(event) {
    processEvents(event, this.executionService)
  }

  onChatError(message: string) {
    this.executionService.markError(message)
  }

  onChatStop(event) {
    this.executionService.clear()
  }

  restart() {
    this.executionService.setConversation(null)
    this.conversations.set([null])
    this.conversationId.set(null)
  }

  close() {
    this.execution.emit(null)
    this.xpertStudioComponent.sidePanel.set(null)
    this.executionService.setConversation(null)
    this.closed.emit()
  }

  openExecution(executionId: string) {
    this.execution.emit(executionId)
  }
}
