import { CommonModule } from '@angular/common'
import { Component, computed, effect, inject, model, output, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { TranslateModule } from '@ngx-translate/core'
import {
  ChatConversationService,
  ChatMessageFeedbackRatingEnum,
  ChatMessageFeedbackService,
  IChatMessage,
  ToastrService,
  XpertAgentExecutionService,
  XpertAgentExecutionStatusEnum,
  XpertAPIService
} from 'apps/cloud/src/app/@core'
import { ChatConversationPreviewComponent } from 'apps/cloud/src/app/@shared/chat'
import { MarkdownModule } from 'ngx-markdown'
import { XpertStudioApiService } from '../../domain'
import { XpertExecutionService } from '../../services/execution.service'
import { XpertStudioComponent } from '../../studio.component'
import { processEvents } from '../agent-execution/execution.component'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    MatTooltipModule,
    MarkdownModule,
    ChatConversationPreviewComponent
  ],
  selector: 'xpert-studio-panel-preview',
  templateUrl: 'preview.component.html',
  styleUrls: ['preview.component.scss']
})
export class XpertStudioPreviewComponent {
  eExecutionStatusEnum = XpertAgentExecutionStatusEnum
  eFeedbackRatingEnum = ChatMessageFeedbackRatingEnum

  readonly xpertService = inject(XpertAPIService)
  readonly apiService = inject(XpertStudioApiService)
  readonly executionService = inject(XpertExecutionService)
  readonly conversationService = inject(ChatConversationService)
  readonly agentExecutionService = inject(XpertAgentExecutionService)
  readonly messageFeedbackService = inject(ChatMessageFeedbackService)
  readonly studioComponent = inject(XpertStudioComponent)
  readonly #toastr = inject(ToastrService)

  // Models
  readonly conversationId = model<string>(null)
  readonly conversations = signal<string[]>([null])
  readonly messages = model<IChatMessage[]>()
  readonly currentMessage = model<IChatMessage>()

  // Outputs
  readonly execution = output<string>()

  readonly envriments = signal(false)

  readonly xpert = this.studioComponent.xpert
  readonly parameters = computed(() => 
    this.apiService.xpert().agentConfig?.parameters ||
    (this.apiService.primaryAgent()?.options?.hidden ? null : this.apiService.primaryAgent()?.parameters)
  )
  readonly environmentId = this.apiService.environmentId

  readonly input = model<string>()
  readonly inputLength = computed(() => this.input()?.length)
  readonly loading = signal(false)

  readonly output = signal('')

  readonly conversation = this.executionService.conversation

  constructor() {
    effect(
      () => {
        if (this.executionService.conversationId()) {
          this.conversationId.set(this.executionService.conversationId())
          this.conversations.set([this.executionService.conversationId()])
        }
      },
      { allowSignalWrites: true }
    )

    effect(() => {
      if (this.messages()) {
        const messages = [...this.messages()]
        if (this.currentMessage()) {
          messages.push(this.currentMessage())
        }
        this.executionService.setMessages(messages)
      }
    }, { allowSignalWrites: true })
  }

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
    this.studioComponent.sidePanel.set(null)
    this.executionService.setConversation(null)
  }

  openExecution(executionId: string) {
    this.execution.emit(executionId)
  }
}
