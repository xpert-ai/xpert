import { Component, computed, effect, inject, model, output, signal, viewChild } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule } from '@ngx-translate/core'
import {
  ChatConversationService,
  ChatMessageEventTypeEnum,
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
import { ZardTooltipImports } from '@xpert-ai/headless-ui'

@Component({
  standalone: true,
  imports: [
    FormsModule,
    TranslateModule,
    ...ZardTooltipImports,
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
  readonly previewComponent = viewChild(ChatConversationPreviewComponent)
  #handledPreviewRetryNonce = 0

  // Outputs
  readonly execution = output<string>()

  readonly envriments = signal(false)

  readonly xpert = this.studioComponent.xpert
  readonly parameters = computed(
    () =>
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
      }
    )

    effect(
      () => {
        if (this.messages()) {
          const messages = [...this.messages()]
          if (this.currentMessage()) {
            messages.push(this.currentMessage())
          }
          this.executionService.setMessages(messages)
        }
      }
    )

    effect(() => {
      const preview = this.previewComponent()
      const request = this.executionService.previewRetryRequest()
      if (!preview || !request || request.nonce === this.#handledPreviewRetryNonce) {
        return
      }

      this.#handledPreviewRetryNonce = request.nonce
      preview.retryMessage(request.messageId, request.checkpointId)
      this.executionService.consumePreviewRetry()
    })
  }

  onChatEvent(event) {
    processEvents(event, this.executionService)

    if (
      this.executionService.previewRetrySelectionPending() &&
      event?.event === ChatMessageEventTypeEnum.ON_AGENT_END &&
      !event.data?.parentId &&
      (event.data?.checkpointNs ?? '') === ''
    ) {
      this.executionService.completePreviewRetrySelection(event.data?.id)
      return
    }

    if (
      this.executionService.previewRetrySelectionPending() &&
      event?.event === ChatMessageEventTypeEnum.ON_CONVERSATION_END &&
      this.currentMessage()?.executionId
    ) {
      this.executionService.completePreviewRetrySelection(this.currentMessage().executionId)
    }
  }

  onChatError(message: string) {
    this.executionService.clearPreviewRetry()
    this.executionService.markError(message)
  }

  onChatStop(event) {
    this.executionService.clearPreviewRetry()
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
    this.executionService.selectExecution(executionId)
    this.execution.emit(executionId)
  }
}
