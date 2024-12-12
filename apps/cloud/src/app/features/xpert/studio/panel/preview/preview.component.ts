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
  ChatMessageTypeEnum,
  CopilotChatMessage,
  ToastrService,
  uuid,
  XpertAgentExecutionService,
  XpertAgentExecutionStatusEnum,
  XpertService
} from 'apps/cloud/src/app/@core'
import { EmojiAvatarComponent } from 'apps/cloud/src/app/@shared/avatar'
import { MarkdownModule } from 'ngx-markdown'
import { of, Subscription } from 'rxjs'
import { XpertStudioApiService } from '../../domain'
import { XpertExecutionService } from '../../services/execution.service'
import { XpertStudioComponent } from '../../studio.component'
import { processEvents } from '../agent-execution/execution.component'
import { XpertPreviewAiMessageComponent } from './ai-message/message.component'
import { MaterialModule } from 'apps/cloud/src/app/@shared/material.module'
import { ToolCallConfirmComponent, XpertParametersCardComponent } from 'apps/cloud/src/app/@shared/xpert'
import { derivedAsync } from 'ngxtension/derived-async'
import { AIMessage, mapStoredMessageToChatMessage } from '@langchain/core/messages'

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

  readonly xpertService = inject(XpertService)
  readonly apiService = inject(XpertStudioApiService)
  readonly executionService = inject(XpertExecutionService)
  readonly conversationService = inject(ChatConversationService)
  readonly agentExecutionService = inject(XpertAgentExecutionService)
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

  readonly currentMessage = signal<CopilotChatMessage>(null)
  readonly messages = computed<CopilotChatMessage[]>(() => {
    if (this.currentMessage()) {
      const messages = this.executionService.messages()
      const lastMessage = messages[messages.length - 1]
      // Skip the last interrupted message when continuing the chat conversation
      if (lastMessage.status === XpertAgentExecutionStatusEnum.INTERRUPTED) {
        return [...messages.slice(0, messages.length - 1), this.currentMessage()]
      }
      return [...this.executionService.messages(), this.currentMessage()]
    }
    return this.executionService.messages()
  })

  readonly lastMessage = computed(() => {
    const messages = this.messages()
    if (messages) {
      return messages[messages.length - 1]
    }
    return null
  })

  readonly lastExecutionId = computed(() => {
    return this.lastMessage()?.executionId
  })
  readonly lastStatus = computed(() => {
    return this.lastMessage()?.status
  })
  readonly #lastExecution = derivedAsync(() => {
    const id = this.lastExecutionId()
    const status = this.lastStatus()
    return (status === XpertAgentExecutionStatusEnum.INTERRUPTED && id) ? this.agentExecutionService.getOneLog(id) : of(null)
  })

  readonly lastExecMessage = computed(() => {
    const messages = this.#lastExecution()?.messages
    if (messages) {
      return messages[messages.length - 1]
    }
    return null
  })
  readonly lastAIMessage = model<AIMessage>(null)
  readonly tools = signal([])

  private chatSubscription: Subscription
  constructor() {
    effect(() => {
      // console.log(this.lastMessage(), this.messages())
    })

    effect(() => {
      const message = this.lastExecMessage()
      if (message) {
        this.lastAIMessage.set(mapStoredMessageToChatMessage(message))
      } else {
        this.lastAIMessage.set(null)
      }
    }, { allowSignalWrites: true })
  }

  chat(input: string, options?: {reject: boolean}) {
    this.loading.set(true)

    if (input) {
      // Add to user message
      this.executionService.appendMessage({
        role: 'human',
        content: input,
        id: uuid()
      })
      this.input.set('')
      this.currentMessage.set({
        id: uuid(),
        role: 'ai',
        content: '',
        status: 'thinking'
      })
    } else if (this.lastStatus() === XpertAgentExecutionStatusEnum.INTERRUPTED) {
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
          input: { input },
          conversationId: this.conversation()?.id,
          xpertId: this.xpert().id,
          toolCalls: this.lastAIMessage()?.tool_calls,
          reject: options?.reject
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
        },
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

      this.chat(this.input())
      event.preventDefault()
    }
  }

  openExecution(message: CopilotChatMessage) {
    this.execution.emit(message.executionId)
  }

  onConfirm() {
    this.chat(null)
  }
  onReject() {
    this.chat(null, {reject: true})
  }
}
