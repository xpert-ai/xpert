import { Clipboard } from '@angular/cdk/clipboard'
import { TextFieldModule } from '@angular/cdk/text-field'
import { CommonModule } from '@angular/common'
import {
  booleanAttribute,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  model,
  output,
  signal
} from '@angular/core'
import { FormsModule } from '@angular/forms'
import { MatTooltipModule } from '@angular/material/tooltip'
import { appendMessageContent, stringifyMessageContent } from '@metad/copilot'
import { nonBlank } from '@metad/core'
import { TranslateModule } from '@ngx-translate/core'
import {
  ChatConversationService,
  ChatMessageEventTypeEnum,
  ChatMessageFeedbackRatingEnum,
  ChatMessageFeedbackService,
  ChatMessageTypeEnum,
  getErrorMessage,
  IChatConversation,
  IChatMessage,
  IChatMessageFeedback,
  IXpert,
  ToastrService,
  ToolCall,
  TXpertParameter,
  uuid,
  XpertAgentExecutionService,
  XpertAgentExecutionStatusEnum,
  XpertService
} from 'apps/cloud/src/app/@core'
import { EmojiAvatarComponent } from 'apps/cloud/src/app/@shared/avatar'
import { ToolCallConfirmComponent, XpertParametersCardComponent } from 'apps/cloud/src/app/@shared/xpert'
import { MarkdownModule } from 'ngx-markdown'
import { derivedAsync } from 'ngxtension/derived-async'
import { map, Observable, of, Subject, timer, switchMap, tap, Subscription } from 'rxjs'
import { XpertPreviewAiMessageComponent } from './ai-message/message.component'
import { effectAction } from '@metad/ocap-angular/core'
import { toObservable } from '@angular/core/rxjs-interop'

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    TranslateModule,
    TextFieldModule,
    MatTooltipModule,
    MarkdownModule,
    EmojiAvatarComponent,
    XpertParametersCardComponent,
    XpertPreviewAiMessageComponent,
    ToolCallConfirmComponent
  ],
  selector: 'chat-conversation-preview',
  templateUrl: 'preview.component.html',
  styleUrls: ['preview.component.scss']
})
export class ChatConversationPreviewComponent {
  eExecutionStatusEnum = XpertAgentExecutionStatusEnum
  eFeedbackRatingEnum = ChatMessageFeedbackRatingEnum

  readonly xpertService = inject(XpertService)
  readonly conversationService = inject(ChatConversationService)
  readonly agentExecutionService = inject(XpertAgentExecutionService)
  readonly messageFeedbackService = inject(ChatMessageFeedbackService)
  readonly #toastr = inject(ToastrService)
  readonly #destroyRef = inject(DestroyRef)
  readonly #clipboard = inject(Clipboard)

  // Inputs
  readonly conversationId = model<string>()
  readonly xpert = model<Partial<IXpert>>()
  readonly input = model<string>()
  readonly parameters = model<TXpertParameter[]>()
  readonly readonly = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })
  readonly _messages = model<IChatMessage[]>()
  readonly parameterValue = model<Record<string, unknown>>()

  // Outputs
  readonly execution = output<string>()
  readonly close = output<void>()
  readonly chatEvent = output<any>()
  readonly chatError = output<string>()
  readonly chatStop = output<void>()

  // States
  readonly conversation = signal<Partial<IChatConversation>>(null)

  readonly feedbacks = signal<Record<string, IChatMessageFeedback>>({})
  readonly #feedbacks = derivedAsync(() => {
    return this.conversationId()
      ? this.messageFeedbackService
          .getMyAll({ where: { conversationId: this.conversationId() } })
          .pipe(map(({ items }) => items))
      : of(null)
  })
  readonly envriments = signal(false)
  readonly avatar = computed(() => this.xpert()?.avatar)
  readonly starters = computed(() => this.xpert()?.starters?.filter(nonBlank))
  readonly inputLength = computed(() => this.input()?.length)
  readonly loading = signal(false)

  readonly output = signal('')

  readonly conversationStatus = computed(() => this.conversation()?.status)
  readonly error = computed(() => this.conversation()?.error)
  readonly operation = computed(() => this.conversation()?.operation)

  readonly toolCalls = signal<ToolCall[]>(null)

  readonly lastMessage = computed(() => {
    const messages = this._messages()
    if (messages) {
      return messages[messages.length - 1]
    }
    return null
  })
  readonly currentMessage = signal<Partial<IChatMessage>>(null)
  readonly messages = computed(() => {
    if (this.currentMessage()) {
      const messages = this._messages()
      const lastMessage = messages[messages.length - 1]
      // Skip the last interrupted message when continuing the chat conversation
      if (lastMessage?.status === XpertAgentExecutionStatusEnum.INTERRUPTED) {
        return [...messages.slice(0, messages.length - 1), this.currentMessage()] as IChatMessage[]
      }
      return [...this._messages(), this.currentMessage()] as IChatMessage[]
    }
    return this._messages() as IChatMessage[]
  })

  readonly copiedMessages = signal<Record<string, boolean>>({})

  private convSub = toObservable(this.conversationId)
    .pipe(
      switchMap((id) =>
        id
          ? this.conversationService.getOneById(this.conversationId(), {
              relations: ['messages', 'xpert', 'xpert.agent', 'xpert.agents']
            })
          : of(null)
      )
    )
    .subscribe((conv) => {
      this.conversation.set(conv)
      if (conv) {
        this._messages.set(conv.messages)
        if (!this.xpert()) {
          this.xpert.set(conv.xpert)
        }
        this.parameterValue.set(conv.options?.parameters ?? {})
      } else {
        this.parameterValue.set(null)
      }
    })

  private chatSubscription: Subscription
  constructor() {
    effect(
      () => {
        if (this.#feedbacks()) {
          this.feedbacks.set(
            this.#feedbacks().reduce((acc, curr) => {
              acc[curr.messageId] = curr
              return acc
            }, {})
          )
        }
      },
      { allowSignalWrites: true }
    )
  }

  chat(options?: { input?: string; confirm?: boolean; reject?: boolean; retry?: boolean }) {
    this.loading.set(true)

    if (options?.input) {
      // Add to user message
      this.appendMessage({
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
          input: {
            ...(this.parameterValue() ?? {}),
            input: options?.input
          },
          conversationId: this.conversation()?.id,
          xpertId: this.xpert().id,
          toolCalls: this.toolCalls(),
          reject: options?.reject,
          confirm: options?.confirm,
          retry: options?.retry,
        },
        {
          isDraft: true
        }
      )
      .subscribe({
        next: (msg) => {
          if (msg.event === 'error') {
            this.onChatError(msg.data)
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
                this.chatEvent.emit(event)
                switch (event.event) {
                  case ChatMessageEventTypeEnum.ON_CONVERSATION_START:
                  case ChatMessageEventTypeEnum.ON_CONVERSATION_END: {
                    this.conversation.update((state) => ({
                      ...(state ?? {}),
                      ...event.data
                    }))
                    break
                  }
                  case ChatMessageEventTypeEnum.ON_MESSAGE_START: {
                    this.currentMessage.update((state) => ({
                      ...state,
                      ...event.data
                    }))
                    break
                  }
                  case ChatMessageEventTypeEnum.ON_AGENT_END: {
                    this.currentMessage.update((message) => ({
                      ...message,
                      executionId: event.data.id,
                      status: event.data.status
                    }))
                    break
                  }
                }
              }
            }
          }
        },
        error: (err) => {
          this.onChatError(getErrorMessage(err))
        },
        complete: () => {
          this.loading.set(false)
          if (this.currentMessage()) {
            this.appendMessage({ ...this.currentMessage() })
          }
          this.currentMessage.set(null)
        }
      })
  }

  onChatError(message: string) {
    this.loading.set(false)
    if (this.currentMessage()) {
      this.appendMessage({ ...this.currentMessage() })
    }
    this.currentMessage.set(null)
    this.conversation.update((state) => ({
      ...(state ?? {}),
      status: XpertAgentExecutionStatusEnum.ERROR,
      error: message
    }))
    this.chatError.emit(message)
  }

  onStop() {
    if (this.chatSubscription && !this.chatSubscription?.closed) {
      this.chatSubscription.unsubscribe()
    }
    this.loading.set(false)
    this.currentMessage.set(null)
    this.chatStop.emit()
  }

  appendMessage(message: Partial<IChatMessage>) {
    this._messages.update((state) => {
      const messages = state?.filter((_) => _.id !== message.id)
      return [...(messages ?? []), message as IChatMessage]
    })
  }

  copy = effectAction((origin$: Observable<IChatMessage>) =>
    origin$.pipe(
      tap((message) => {
        this.#clipboard.copy(stringifyMessageContent(message.content))
        this.#toastr.info({ code: 'PAC.Xpert.Copied', default: 'Copied' })
        this.copiedMessages.update((state) => ({...state, [message.id]: true}))
      }),
      switchMap((message) => timer(3000).pipe(
        tap(() => this.copiedMessages.update((state) => ({...state, [message.id]: false})))
      )),
    )
  )

  onKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      if (event.isComposing || event.shiftKey) {
        return
      }

      this.chat({ input: this.input() })
      event.preventDefault()
    }
  }

  openExecution(message: IChatMessage) {
    this.execution.emit(message.executionId)
  }

  onToolCalls(toolCalls: ToolCall[]) {
    this.toolCalls.set(toolCalls)
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
          this.feedbacks.update((state) => ({
            ...(state ?? {}),
            [message.id]: feedback
          }))
          this.#toastr.success('PAC.Messages.UpdatedSuccessfully', { Default: 'Updated successfully' })
        },
        error: (error) => {
          this.#toastr.error(getErrorMessage(error))
        }
      })
  }

  cancelFeedback(message: Partial<IChatMessage>, id: string) {
    this.messageFeedbackService.delete(id).subscribe({
      next: () => {
        this.feedbacks.update((state) => ({
          ...(state ?? {}),
          [message.id]: null
        }))
        this.#toastr.success('PAC.Messages.UpdatedSuccessfully', { Default: 'Updated successfully' })
      },
      error: (error) => {
        this.#toastr.error(getErrorMessage(error))
      }
    })
  }

  getFeedback(id: string) {
    return this.feedbacks()?.[id]
  }

  restart() {
    this.conversationId.set(null)
    this.conversation.set(null)
    this._messages.set([])
  }

  onRetry() {
    this.conversation.update((state) => {
      return{
        ...state,
        status: 'busy',
        error: null
      }
    })

    this.chat({
      retry: true
    })
  }
}
