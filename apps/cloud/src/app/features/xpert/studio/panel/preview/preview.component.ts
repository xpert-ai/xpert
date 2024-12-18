import { Clipboard } from '@angular/cdk/clipboard'
import { TextFieldModule } from '@angular/cdk/text-field'
import { CommonModule } from '@angular/common'
import { Component, computed, DestroyRef, effect, inject, model, output, signal } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { appendMessageContent, nonBlank, stringifyMessageContent } from '@metad/copilot'
import { TranslateModule } from '@ngx-translate/core'
import {
  ChatConversationService,
  ChatMessageEventTypeEnum,
  ChatMessageFeedbackRatingEnum,
  ChatMessageFeedbackService,
  ChatMessageTypeEnum,
  CopilotChatMessage,
  getErrorMessage,
  IChatMessage,
  ToastrService,
  ToolCall,
  uuid,
  XpertAgentExecutionService,
  XpertAgentExecutionStatusEnum,
  XpertService
} from 'apps/cloud/src/app/@core'
import { EmojiAvatarComponent } from 'apps/cloud/src/app/@shared/avatar'
import { MaterialModule } from 'apps/cloud/src/app/@shared/material.module'
import { ToolCallConfirmComponent, XpertParametersCardComponent } from 'apps/cloud/src/app/@shared/xpert'
import { MarkdownModule } from 'ngx-markdown'
import { Subscription } from 'rxjs'
import { XpertStudioApiService } from '../../domain'
import { XpertExecutionService } from '../../services/execution.service'
import { XpertStudioComponent } from '../../studio.component'
import { processEvents } from '../agent-execution/execution.component'
import { XpertPreviewAiMessageComponent } from './ai-message/message.component'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MaterialModule,
    TranslateModule,
    TextFieldModule,
    MarkdownModule,
    EmojiAvatarComponent,
    XpertParametersCardComponent,
    XpertPreviewAiMessageComponent,
    ToolCallConfirmComponent
  ],
  selector: 'xpert-studio-panel-preview',
  templateUrl: 'preview.component.html',
  styleUrls: ['preview.component.scss']
})
export class XpertStudioPreviewComponent {
  eExecutionStatusEnum = XpertAgentExecutionStatusEnum
  eFeedbackRatingEnum = ChatMessageFeedbackRatingEnum

  readonly xpertService = inject(XpertService)
  readonly apiService = inject(XpertStudioApiService)
  readonly executionService = inject(XpertExecutionService)
  readonly conversationService = inject(ChatConversationService)
  readonly agentExecutionService = inject(XpertAgentExecutionService)
  readonly messageFeedbackService = inject(ChatMessageFeedbackService)
  readonly studioComponent = inject(XpertStudioComponent)
  readonly #toastr = inject(ToastrService)
  readonly #destroyRef = inject(DestroyRef)
  readonly #clipboard = inject(Clipboard)

  // Outputs
  readonly execution = output<string>()

  readonly envriments = signal(false)

  readonly xpert = this.studioComponent.xpert
  readonly parameters = computed(() => this.apiService.primaryAgent()?.parameters)
  readonly avatar = computed(() => this.xpert()?.avatar)
  readonly starters = computed(() => this.xpert()?.starters?.filter(nonBlank))

  readonly input = model<string>()
  readonly inputLength = computed(() => this.input()?.length)
  readonly loading = signal(false)

  readonly output = signal('')

  readonly conversation = this.executionService.conversation
  readonly feedbacks = this.executionService.feedbacks

  readonly currentMessage = signal<Partial<CopilotChatMessage>>(null)
  readonly messages = computed<CopilotChatMessage[]>(() => {
    if (this.currentMessage()) {
      const messages = this.executionService.messages()
      const lastMessage = messages[messages.length - 1]
      // Skip the last interrupted message when continuing the chat conversation
      if (lastMessage.status === XpertAgentExecutionStatusEnum.INTERRUPTED) {
        return [...messages.slice(0, messages.length - 1), this.currentMessage()] as CopilotChatMessage[]
      }
      return [...this.executionService.messages(), this.currentMessage()] as CopilotChatMessage[]
    }
    return this.executionService.messages() as CopilotChatMessage[]
  })

  readonly lastMessage = computed(() => {
    const messages = this.messages()
    if (messages) {
      return messages[messages.length - 1]
    }
    return null
  })
  readonly conversationStatus = computed(() => this.conversation()?.status)
  readonly operation = computed(() => this.conversation()?.operation)

  readonly toolCalls = signal<ToolCall[]>(null)

  private chatSubscription: Subscription
  constructor() {
    effect(() => {
      // console.log(this.lastMessage(), this.messages())
    })
  }

  chat(options?: { input?: string; confirm?: boolean; reject?: boolean }) {
    this.loading.set(true)

    if (options?.input) {
      // Add to user message
      this.executionService.appendMessage({
        role: 'human',
        content: options.input,
        id: uuid()
      })
      this.input.set('')
      this.currentMessage.set({
        id: uuid(),
        role: 'ai',
        content: '',
        status: 'thinking'
      })
    } else if (this.conversationStatus() === XpertAgentExecutionStatusEnum.INTERRUPTED) {
      this.currentMessage.set({
        ...this.lastMessage(),
        status: 'thinking'
      })
    }

    // Send to server chat
    if (this.chatSubscription && !this.chatSubscription?.closed) {
      this.chatSubscription.unsubscribe()
    }
    this.chatSubscription = this.xpertService
      .chat(
        this.xpert().id,
        {
          input: { input: options?.input },
          conversationId: this.conversation()?.id,
          xpertId: this.xpert().id,
          toolCalls: this.toolCalls(),
          reject: options?.reject,
          confirm: options?.confirm
        },
        {
          isDraft: true
        }
      )
      .subscribe({
        next: (msg) => {
          if (msg.event === 'error') {
            this.#toastr.error(msg.data)
          } else {
            if (msg.data) {
              const event = JSON.parse(msg.data)
              if (event.type === ChatMessageTypeEnum.MESSAGE) {
                this.currentMessage.update((message) => {
                  appendMessageContent(message as any, event.data)
                  return { ...message }
                })
                if (typeof event.data === 'string') {
                  // Update last AI message
                  this.output.update((state) => state + event.data)
                }
              } else if (event.type === ChatMessageTypeEnum.EVENT) {
                processEvents(event, this.executionService)
                if (event.event === ChatMessageEventTypeEnum.ON_MESSAGE_START) {
                  this.currentMessage.update((state) => ({
                    ...state,
                    ...event.data
                  }))
                }
                if (event.event === ChatMessageEventTypeEnum.ON_AGENT_END) {
                  this.currentMessage.update((message) => ({
                    ...message,
                    executionId: event.data.id,
                    status: event.data.status
                  }))
                }
              }
            }
          }
        },
        error: (err) => {
          console.error(err)
          this.loading.set(false)
          if (this.currentMessage()) {
            this.executionService.appendMessage({ ...this.currentMessage() })
          }
          this.currentMessage.set(null)
        },
        complete: () => {
          this.loading.set(false)
          if (this.currentMessage()) {
            this.executionService.appendMessage({ ...this.currentMessage() })
          }
          this.currentMessage.set(null)
        }
      })
  }

  stop() {
    if (this.chatSubscription && !this.chatSubscription?.closed) {
      this.chatSubscription.unsubscribe()
    }
    this.loading.set(false)
    this.currentMessage.set(null)
    this.executionService.clear()
  }

  restart() {
    this.executionService.setConversation(null)
  }

  close() {
    this.studioComponent.preview.set(false)
    this.executionService.setConversation(null)
  }

  copy(message: CopilotChatMessage) {
    this.#clipboard.copy(stringifyMessageContent(message.content))
    this.#toastr.info({ code: 'PAC.Xpert.Copied', default: 'Copied' })
  }

  onKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      if (event.isComposing || event.shiftKey) {
        return
      }

      this.chat({ input: this.input() })
      event.preventDefault()
    }
  }

  openExecution(message: CopilotChatMessage) {
    this.execution.emit(message.executionId)
  }

  onToolCalls(toolCalls: ToolCall[]) {
    this.toolCalls.set(toolCalls)
  }

  onConfirm() {
    this.chat({ confirm: true })
    this.executionService.conversation.update((state) => ({ ...state, status: 'busy' }))
  }
  onReject() {
    this.chat({ reject: true })
    this.executionService.conversation.update((state) => ({ ...state, status: 'busy' }))
  }

  feedback(message: Partial<IChatMessage>, rating: ChatMessageFeedbackRatingEnum) {
    this.messageFeedbackService
      .create({
        messageId: message.id,
        conversationId: message.conversationId,
        rating
      })
      .subscribe({
        next: (feedback) => {
          this.executionService.feedbacks.update((state) => ({
            ...(state ?? {}),
            [message.id]: feedback
          }))
          this.#toastr.success('PAC.Messages.UpdatedSuccessfully', {Default: 'Updated successfully'})
        },
        error: (error) => {
          this.#toastr.error(getErrorMessage(error))
        }
      })
  }

  cancelFeedback(message: Partial<IChatMessage>, id: string) {
    this.messageFeedbackService
      .delete(id)
      .subscribe({
        next: () => {
          this.executionService.feedbacks.update((state) => ({
            ...(state ?? {}),
            [message.id]: null
          }))
          this.#toastr.success('PAC.Messages.UpdatedSuccessfully', {Default: 'Updated successfully'})
        },
        error: (error) => {
          this.#toastr.error(getErrorMessage(error))
        }
      })
  }

  getFeedback(id: string) {
    return this.feedbacks()?.[id]
  }
}
