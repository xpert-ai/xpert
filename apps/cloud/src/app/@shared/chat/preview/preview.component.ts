import { Clipboard } from '@angular/cdk/clipboard'
import { TextFieldModule } from '@angular/cdk/text-field'
import { CommonModule } from '@angular/common'
import {
  booleanAttribute,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  input,
  model,
  output,
  signal,
  viewChild
} from '@angular/core'
import { FormsModule } from '@angular/forms'
import { TranslateModule, TranslateService } from '@ngx-translate/core'
import {
  appendMessageContent,
  appendMessagePlainText,
  Attachment_Type_Options,
  AudioRecorderService,
  ChatConversationService,
  ChatMessageEventTypeEnum,
  ChatMessageFeedbackRatingEnum,
  ChatMessageFeedbackService,
  ChatMessageService,
  ChatMessageTypeEnum,
  ChatService,
  getErrorMessage,
  IChatConversation,
  IChatMessage,
  IChatMessageFeedback,
  IStorageFile,
  IXpert,
  createMessageAppendContextTracker,
  SynthesizeService,
  TChatRequest,
  TXpertChatResumeDecision,
  TInterruptCommand,
  ToastrService,
  TtsStreamPlayerService,
  TXpertParameter,
  stringifyMessageContent,
  uuid,
  XpertAgentExecutionService,
  XpertAgentExecutionStatusEnum,
  XpertAPIService,
  Store
} from '@cloud/app/@core'
import { EmojiAvatarComponent } from '@cloud/app/@shared/avatar'
import { XpertParametersCardComponent } from '@cloud/app/@shared/xpert'
import { MarkdownModule } from 'ngx-markdown'
import { derivedAsync } from 'ngxtension/derived-async'
import { map, Observable, of, timer, switchMap, tap, Subscription } from 'rxjs'
import { effectAction } from '@xpert-ai/ocap-angular/core'
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop'
import { injectConfirmDelete } from '@xpert-ai/ocap-angular/common'
import { CdkMenuModule } from '@angular/cdk/menu'
import { XpertPreviewAiMessageComponent } from './ai-message/message.component'
import { ChatAttachmentsComponent } from '../attachments/attachments.component'
import { ChatHumanMessageComponent } from './human-message/message.component'
import { XpertAgentOperationComponent } from '../../agent'
import { ZardTooltipImports } from '@xpert-ai/headless-ui'
import { filterLatestMessages } from '../filter-latest-messages'
import { buildResumeDecision, extractInterruptPatch } from '../interrupt-request'
import { isThreadContextUsageEvent } from '../context/thread-context-usage'
import {
  createReferenceHumanInput,
  getReferenceKey,
  getReferenceLabel,
  getReferenceSource,
  mergeReferences,
  XpertChatReference,
  XpertQuoteReference
} from '../references'
import { parseFollowUpConsumedEvent, resolveFollowUpConsumedIds } from '../context/follow-up-consumed'

function findLastAiMessageId(messages: Array<{ id?: string; role?: string }> | null | undefined): string | null {
  return [...(messages ?? [])].reverse().find((message) => message?.role === 'ai')?.id ?? null
}

type PendingFollowUp = {
  id: string
  input: string
  files?: IStorageFile[]
  references?: XpertChatReference[]
  mode: 'queue' | 'steer'
}

type QuoteSelectionState = {
  left: number
  top: number
  reference: XpertQuoteReference
}

@Component({
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    CdkMenuModule,
    TranslateModule,
    TextFieldModule,
    ...ZardTooltipImports,
    MarkdownModule,
    EmojiAvatarComponent,
    XpertParametersCardComponent,
    XpertPreviewAiMessageComponent,
    XpertAgentOperationComponent,
    ChatAttachmentsComponent,
    ChatHumanMessageComponent
  ],
  selector: 'xp-chat-conversation-preview',
  templateUrl: 'preview.component.html',
  styleUrls: ['preview.component.scss'],
  providers: [TtsStreamPlayerService, AudioRecorderService, SynthesizeService]
})
export class ChatConversationPreviewComponent {
  eExecutionStatusEnum = XpertAgentExecutionStatusEnum
  eFeedbackRatingEnum = ChatMessageFeedbackRatingEnum

  readonly xpertService = inject(XpertAPIService)
  readonly conversationService = inject(ChatConversationService)
  readonly agentExecutionService = inject(XpertAgentExecutionService)
  readonly messageFeedbackService = inject(ChatMessageFeedbackService)
  readonly chatMessageService = inject(ChatMessageService)
  readonly chatService = inject(ChatService)
  readonly #toastr = inject(ToastrService)
  readonly #translate = inject(TranslateService)
  readonly #clipboard = inject(Clipboard)
  readonly #elementRef = inject<ElementRef<HTMLElement>>(ElementRef)
  readonly #store = inject(Store)
  readonly confirmDel = injectConfirmDelete()
  readonly #audioRecorder = inject(AudioRecorderService)
  readonly #synthesizeService = inject(SynthesizeService)
  readonly #destroyRef = inject(DestroyRef)
  #destroyed = false

  // Inputs
  readonly conversationId = model<string>()
  readonly xpert = model<Partial<IXpert>>()
  readonly input = model<string>()
  readonly environmentId = model<string>()
  readonly parameters = model<TXpertParameter[]>()
  readonly readonly = input<boolean, boolean | string>(false, {
    transform: booleanAttribute
  })
  readonly _messages = model<IChatMessage[]>()
  readonly currentMessage = model<Partial<IChatMessage>>(null)
  readonly parameterValue = model<Record<string, unknown>>()

  // Outputs
  readonly execution = output<string>()
  readonly close = output<void>()
  readonly restart = output<void>()
  readonly chatEvent = output<any>()
  readonly chatError = output<string>()
  readonly chatStop = output<void>()

  // Children
  readonly canvasRef = viewChild('waveCanvas', { read: ElementRef })

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
  readonly features = computed(() => this.xpert()?.features)
  readonly opener = computed(() => this.features()?.opener)
  readonly starters = computed(() => {
    if (this.opener()?.enabled) {
      return this.opener()?.questions
    }
    return this.xpert()?.starters
  })
  readonly textToSpeech_enabled = computed(() => this.xpert()?.features?.textToSpeech?.enabled)
  readonly speechToText_enabled = computed(() => this.xpert()?.features?.speechToText?.enabled)
  readonly suggestion_enabled = computed(() => this.xpert()?.features?.suggestion?.enabled)
  readonly inputLength = computed(() => this.input()?.length ?? 0)
  readonly references = signal<XpertChatReference[]>([])
  readonly hasReferences = computed(() => this.references().length > 0)
  readonly canSend = computed(() => !!this.input()?.trim() || this.hasReferences())
  readonly referenceKey = getReferenceKey
  readonly referenceLabel = getReferenceLabel
  readonly referenceSource = getReferenceSource
  readonly loading = signal(false)
  readonly pendingFollowUps = signal<PendingFollowUp[]>([])
  readonly followUpBehavior = signal<'queue' | 'steer'>(this.readPersistedFollowUpBehavior())

  readonly output = signal('')

  readonly conversationStatus = computed(() => this.conversation()?.status)
  readonly error = computed(() => this.conversation()?.error)
  // Interrupt operation
  readonly operation = computed(() => this.conversation()?.operation)
  readonly command = model<TInterruptCommand>()
  // Show operation panel only when user input is required
  readonly showOperationPanel = computed(() => {
    const tasks = this.operation()?.tasks ?? []
    return tasks.some((task) => (task.parameters?.length ?? 0) > 0 || (task.interrupts?.length ?? 0) > 0)
  })

  readonly lastMessage = computed(() => {
    const messages = this._messages()
    if (messages) {
      return messages[messages.length - 1]
    }
    return null
  })
  readonly messages = computed(() => {
    const baseMessages = this._messages() ?? []
    if (this.currentMessage()) {
      const messages = baseMessages
      const lastMessage = messages[messages.length - 1]
      // Skip the last interrupted message when continuing the chat conversation
      if (lastMessage?.status === XpertAgentExecutionStatusEnum.INTERRUPTED) {
        return filterLatestMessages([
          ...messages.slice(0, messages.length - 1),
          this.currentMessage()
        ] as IChatMessage[]) as IChatMessage[]
      }
      return filterLatestMessages([...messages, this.currentMessage()] as IChatMessage[]) as IChatMessage[]
    }
    return (filterLatestMessages(baseMessages) ?? []) as IChatMessage[]
  })

  readonly copiedMessages = signal<Record<string, boolean>>({})
  readonly quoteSelection = signal<QuoteSelectionState | null>(null)
  readonly feedbackReady = (message: IChatMessage) => {
    const status = message?.status as XpertAgentExecutionStatusEnum | string
    const endedStatuses = new Set<XpertAgentExecutionStatusEnum | string>([
      XpertAgentExecutionStatusEnum.SUCCESS,
      XpertAgentExecutionStatusEnum.ERROR,
      XpertAgentExecutionStatusEnum.TIMEOUT,
      XpertAgentExecutionStatusEnum.INTERRUPTED,
      'aborted'
    ])
    return endedStatuses.has(status)
  }

  private convSub = toObservable(this.conversationId)
    .pipe(
      switchMap((id) =>
        id
          ? this.conversationService.getOneById(this.conversationId(), {
              relations: ['messages', 'messages.attachments', 'xpert', 'xpert.agent', 'xpert.agents']
            })
          : of(null)
      )
    )
    .subscribe((conv) => {
      this.conversation.set(conv)
      if (conv) {
        this._messages.set(filterLatestMessages(conv.messages) as IChatMessage[])
        if (!this.xpert()) {
          this.xpert.set(conv.xpert)
        }
        this.parameterValue.set(conv.options?.parameters ?? {})
      } else {
        this.parameterValue.set(null)
      }
    })

  private chatSubscription: Subscription
  private readonly messageAppendContextTracker = createMessageAppendContextTracker()
  private shouldStartFreshAssistantMessageAfterSteer = false

  // Attachments
  readonly attachment = computed(() => this.xpert()?.features?.attachment)
  readonly attachment_enabled = computed(() => this.attachment()?.enabled)
  readonly attachment_maxNum = computed(() => this.attachment()?.maxNum ?? 10)
  readonly attachment_accept = computed(() => {
    const fileTypes = this.attachment()?.fileTypes
    if (fileTypes) {
      return fileTypes
        .map((type) =>
          Attachment_Type_Options.find((_) => _.key === type)
            ?.value?.split(',')
            .map((t) => `.${t.trim()}`)
        )
        .flat()
        .join(',')
    }
    return '*/*'
  })
  readonly attachments = signal<{ file?: File; url?: string; storageFile?: IStorageFile }[]>([])
  readonly files = computed(() => this.attachments()?.map(({ storageFile }) => storageFile))

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
      }
    )

    effect(() => this.#audioRecorder.canvasRef.set(this.canvasRef()))
    effect(() => this.#audioRecorder.xpert.set(this.xpert() as IXpert))
    effect(() => this.input.set(this.#audioRecorder.text()))

    if (typeof document !== 'undefined') {
      const selectionHandler = () => this.updateQuoteSelection()
      const clearHandler = () => this.clearQuoteSelection()

      document.addEventListener('selectionchange', selectionHandler)
      window.addEventListener('resize', clearHandler)
      window.addEventListener('scroll', clearHandler, true)

      this.#destroyRef.onDestroy(() => {
        document.removeEventListener('selectionchange', selectionHandler)
        window.removeEventListener('resize', clearHandler)
        window.removeEventListener('scroll', clearHandler, true)
      })
    }

    this.#destroyRef.onDestroy(() => {
      this.#destroyed = true
    })

    effect(() => {
      this.persistFollowUpBehavior(this.followUpBehavior())
    })
  }

  resumeOperation(decision: TXpertChatResumeDecision['type'], command?: TInterruptCommand) {
    this.chat({
      confirm: decision === 'confirm',
      reject: decision === 'reject',
      command
    })
  }

  retryMessage(messageId?: string, checkpointId?: string) {
    this.chat({
      retry: true,
      messageId,
      checkpointId
    })
  }

  sendMessage(input: string | null | undefined, options?: { references?: XpertChatReference[]; followUpBehavior?: 'queue' | 'steer' }) {
    const content = input?.trim() ?? ''
    const references = options?.references ?? []
    if (!content && !references.length) {
      return
    }

    this.chat({
      input: content,
      references,
      followUpBehavior: options?.followUpBehavior
    })
  }

  chat(options?: {
    input?: string
    confirm?: boolean
    files?: IStorageFile[]
    references?: XpertChatReference[]
    messageId?: string
    command?: TInterruptCommand
    /**
     * @deprecated use confirm with command resume instead
     */
    reject?: boolean
    retry?: boolean
    checkpointId?: string
    followUpBehavior?: 'queue' | 'steer'
  }) {
    if (this.loading()) {
      if ((!options?.input && !options?.references?.length) || this.conversationStatus() === XpertAgentExecutionStatusEnum.INTERRUPTED) {
        return
      }

      void this.enqueueFollowUp({
        id: options?.messageId ?? uuid(),
        input: options.input ?? '',
        files: options?.files ?? this.files(),
        references: options?.references,
        mode: options?.followUpBehavior ?? this.followUpBehavior()
      })
      return
    }

    this.suggestionQuestions.set([]) // Clear suggestions after selection
    this.loading.set(true)
    this.messageAppendContextTracker.reset()

    const requestFiles = options?.files ?? this.files()
    const shouldClearAttachments = !options?.files
    const references = options?.references ?? []

    const shouldAppendHuman = !!options?.input?.trim() || references.length > 0
    if (shouldAppendHuman) {
      // Add to user message
      this.appendMessage({
        role: 'human',
        content: options?.input ?? '',
        id: uuid(),
        ...(references.length
          ? {
              references
            }
          : {}),
        attachments: requestFiles
      })
      this.input.set('')
      this.references.set([])
      this.currentMessage.set({
        id: uuid(),
        role: 'ai',
        content: '',
        status: 'thinking'
      })
    } else if (options?.retry) {
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
    this.conversation.update((state) => ({
      ...(state ?? {}),
      status: 'busy',
      error: null
    }))

    // Send to server chat
    if (this.chatSubscription && !this.chatSubscription?.closed) {
      this.chatSubscription.unsubscribe()
    }
    const currentCommand = options?.confirm ? this.command() : options?.command
    const lastAiMessageId = options?.messageId ?? findLastAiMessageId(this.messages())
    let request: TChatRequest
    if (options?.retry) {
      request = {
        action: 'retry',
        conversationId: this.conversation()?.id,
        environmentId: this.environmentId(),
        ...(options.checkpointId ? { checkpointId: options.checkpointId } : {}),
        source: {
          aiMessageId: lastAiMessageId
        }
      } as TChatRequest
    } else if (options?.confirm || options?.reject || currentCommand) {
      const patch = extractInterruptPatch(currentCommand)
      request = {
        action: 'resume',
        conversationId: this.conversation()?.id,
        target: {
          aiMessageId: lastAiMessageId
        },
        decision: buildResumeDecision(options?.reject ? 'reject' : 'confirm', currentCommand),
        ...(patch ? { patch } : {})
      } as TChatRequest
    } else {
      request = {
        action: 'send',
        conversationId: this.conversation()?.id,
        environmentId: this.environmentId(),
        message: {
          clientMessageId: options?.messageId,
          input: {
            ...(this.parameterValue() ?? {}),
            ...createReferenceHumanInput({
              content: options?.input ?? '',
              references,
              files: requestFiles?.map((file) => ({
                id: file.id,
                originalName: file.originalName,
                name: file.originalName,
                filePath: file.file,
                fileUrl: file.url,
                mimeType: file.mimetype,
                size: file.size,
                extension: file.originalName.split('.').pop()
              }))
            })
          }
        }
      } as TChatRequest
    }

    this.chatSubscription = this.xpertService
      .chat(this.xpert().id, request, {
        isDraft: true,
        messageId: options?.messageId
      })
      .pipe(takeUntilDestroyed(this.#destroyRef))
      .subscribe({
        next: (msg) => {
          if (msg.event === 'error') {
            this.onChatError(msg.data)
          } else {
            if (msg.data) {
              // Ignore non-data events
              if (msg.data.startsWith(':')) {
                return
              }
              const event = JSON.parse(msg.data)
              if (event.type === ChatMessageTypeEnum.MESSAGE) {
                const fallbackStreamId = this.currentMessage()?.id ?? this.conversation()?.id ?? 'chat_stream'
                const { messageContext } = this.messageAppendContextTracker.resolve({
                  incoming: event.data,
                  fallbackSource: typeof event.data === 'string' ? 'chat_stream' : undefined,
                  fallbackStreamId: String(fallbackStreamId)
                })

                this.currentMessage.update((message) => {
                  appendMessageContent(message as any, event.data, messageContext)
                  return { ...message }
                })
                if (typeof event.data === 'string') {
                  // Update last AI message
                  this.output.update((state) => appendMessagePlainText(state, event.data, messageContext))
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
                    if (this.shouldStartFreshAssistantMessageAfterSteer || !this.currentMessage()) {
                      this.currentMessage.set({
                        ...event.data
                      })
                    } else {
                      this.currentMessage.update((state) => ({
                        ...state,
                        ...event.data
                      }))
                    }
                    this.shouldStartFreshAssistantMessageAfterSteer = false
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
                  case ChatMessageEventTypeEnum.ON_CHAT_EVENT: {
                    if (isThreadContextUsageEvent(event.data)) {
                      break
                    }
                    const followUpConsumedEvent = parseFollowUpConsumedEvent(event.data)
                    if (followUpConsumedEvent) {
                      if (this.currentMessage()) {
                        this.appendMessage({ ...this.currentMessage() })
                        this.currentMessage.set(null)
                      }
                      this.flushPendingSteerFollowUps(resolveFollowUpConsumedIds(followUpConsumedEvent))
                      this.shouldStartFreshAssistantMessageAfterSteer = true
                      break
                    }
                    this.currentMessage.update((state) => ({
                      ...state,
                      events: [...(state.events ?? []), event.data]
                    }))
                    break
                  }
                }
              }
            }
          }
        },
        error: (err) => {
          this.messageAppendContextTracker.reset()
          this.shouldStartFreshAssistantMessageAfterSteer = false
          this.onChatError(getErrorMessage(err))
        },
        complete: () => {
          this.messageAppendContextTracker.reset()
          this.shouldStartFreshAssistantMessageAfterSteer = false
          if (this.#destroyed) {
            return
          }
          this.loading.set(false)
          this.downgradePendingSteerFollowUpsToQueue()
          if (this.currentMessage()) {
            this.appendMessage({ ...this.currentMessage() })
          }
          if (this.suggestion_enabled()) {
            this.onSuggestionQuestions(this.currentMessage().id)
          }
          this.currentMessage.set(null)
          this.drainQueuedFollowUps()
        }
      })

    // Clear only when using current attachments
    if (shouldClearAttachments) {
      this.attachments.set([])
    }
  }

  onChatError(message: string) {
    this.loading.set(false)
    this.shouldStartFreshAssistantMessageAfterSteer = false
    this.downgradePendingSteerFollowUpsToQueue()
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
    this.shouldStartFreshAssistantMessageAfterSteer = false
    this.downgradePendingSteerFollowUpsToQueue()
    this.drainQueuedFollowUps()
    this.currentMessage.set(null)
    this.chatStop.emit()
  }

  // Suggestion Questions
  readonly suggesting = signal(false)
  readonly suggestionQuestions = signal<string[]>([])
  onSuggestionQuestions(id: string) {
    this.suggesting.set(true)
    this.chatMessageService.suggestedQuestions(id).subscribe({
      next: (questions) => {
        this.suggesting.set(false)
        this.suggestionQuestions.set(questions)
      },
      error: (error) => {
        this.suggesting.set(false)
        this.#toastr.error(getErrorMessage(error))
      }
    })
  }

  onSelectSuggestionQuestion(question: string) {
    this.sendMessage(question)
  }

  addReferences(references: XpertChatReference[]) {
    if (!references.length) {
      return
    }

    this.references.update((current) => mergeReferences(current, references))
  }

  removeReference(reference: XpertChatReference) {
    const key = this.referenceKey(reference)
    this.references.update((current) => current.filter((item) => this.referenceKey(item) !== key))
  }

  quoteSelectedText() {
    const selection = this.quoteSelection()
    if (!selection) {
      return
    }

    this.addReferences([selection.reference])
    this.clearBrowserSelection()
    this.clearQuoteSelection()
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
        this.copiedMessages.update((state) => ({ ...state, [message.id]: true }))
      }),
      switchMap((message) =>
        timer(3000).pipe(tap(() => this.copiedMessages.update((state) => ({ ...state, [message.id]: false }))))
      )
    )
  )

  onKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      if (event.isComposing) {
        return
      }

      if (event.shiftKey && (event.metaKey || event.ctrlKey)) {
        if (!this.input() && !this.hasReferences()) {
          return
        }
        this.sendMessage(this.input(), {
          references: this.references(),
          followUpBehavior: this.followUpBehavior() === 'queue' ? 'steer' : 'queue'
        })
        event.preventDefault()
        return
      }

      if (event.shiftKey) {
        return
      }

      this.sendMessage(this.input(), { references: this.references() })
      event.preventDefault()
    }
  }

  setFollowUpBehavior(behavior: 'queue' | 'steer') {
    this.followUpBehavior.set(behavior)
  }

  private async enqueueFollowUp(item: PendingFollowUp) {
    this.pendingFollowUps.update((state) => [...(state ?? []).filter((entry) => entry.id !== item.id), item])
    this.input.set('')
    this.attachments.set([])
    this.references.set([])

    if (item.mode !== 'steer') {
      return
    }

    const request: TChatRequest = {
      action: 'follow_up',
      conversationId: this.conversation()?.id,
      mode: 'steer',
      target: {
        aiMessageId: findLastAiMessageId(this.messages()) ?? undefined,
        executionId: this.currentMessage()?.executionId ?? this.lastMessage()?.executionId ?? undefined
      },
      message: {
        clientMessageId: item.id,
        input: {
          ...(this.parameterValue() ?? {}),
          ...createReferenceHumanInput({
            content: item.input,
            references: item.references,
            files: item.files?.map((file) => ({
              id: file.id,
              originalName: file.originalName,
              name: file.originalName,
              filePath: file.file,
              fileUrl: file.url,
              mimeType: file.mimetype,
              size: file.size,
              extension: file.originalName.split('.').pop()
            }))
          })
        }
      }
    } as TChatRequest

    this.xpertService
      .chat(this.xpert().id, request, {
        isDraft: true,
        messageId: item.id
      })
      .pipe(takeUntilDestroyed(this.#destroyRef))
      .subscribe({
        error: () => {
          this.pendingFollowUps.update((state) =>
            (state ?? []).map((entry) => (entry.id === item.id ? { ...entry, mode: 'queue' } : entry))
          )
        }
      })
  }

  private flushPendingSteerFollowUps(ids: string[]) {
    if (!ids.length) {
      return
    }

    const idSet = new Set(ids)
    const steerItems = this.pendingFollowUps().filter(
      (item) => item.mode === 'steer' && idSet.has(item.id)
    )

    if (!steerItems.length) {
      return
    }

    steerItems.forEach((item) => {
      this.appendMessage({
        id: item.id,
        role: 'human',
        content: item.input,
        conversationId: this.conversation()?.id,
        ...(item.references?.length ? { references: item.references } : {}),
        attachments: item.files
      })
    })
    this.pendingFollowUps.update((state) =>
      (state ?? []).filter((item) => !(item.mode === 'steer' && idSet.has(item.id)))
    )
  }

  private downgradePendingSteerFollowUpsToQueue() {
    this.pendingFollowUps.update((state) =>
      (state ?? []).map((item) => (item.mode === 'steer' ? { ...item, mode: 'queue' } : item))
    )
  }

  private drainQueuedFollowUps() {
    if (this.loading()) {
      return
    }

    const next = this.pendingFollowUps().find((item) => item.mode === 'queue')
    if (!next) {
      return
    }

    this.pendingFollowUps.update((state) => (state ?? []).filter((item) => item.id !== next.id))
    this.chat({
      input: next.input,
      files: next.files,
      references: next.references,
      messageId: next.id
    })
  }

  private getFollowUpStorageKey() {
    return `xpert:agent-chat:follow-up-behavior:${this.#store.organizationId ?? 'tenant'}:${this.#store.userId ?? 'anonymous'}`
  }

  private readPersistedFollowUpBehavior(): 'queue' | 'steer' {
    if (typeof localStorage === 'undefined') {
      return 'queue'
    }

    return localStorage.getItem(this.getFollowUpStorageKey()) === 'steer' ? 'steer' : 'queue'
  }

  private persistFollowUpBehavior(behavior: 'queue' | 'steer') {
    if (typeof localStorage === 'undefined') {
      return
    }

    localStorage.setItem(this.getFollowUpStorageKey(), behavior)
  }

  openExecution(message: IChatMessage) {
    this.execution.emit(message.executionId)
  }

  // onToolCalls(toolCalls: TToolCall[]) {
  //   this.toolCalls.set(toolCalls)
  // }

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

  onRestart() {
    if (this.loading()) {
      this.confirmDel({
        title: this.#translate.instant('PAC.Chat.StopGenerate', { Default: 'Stop generate' }),
        information: this.#translate.instant('PAC.Chat.StopGenerateOnRestart', {
          Default: 'Restarting the conversation will stop current generating content'
        })
      }).subscribe((confirm) => {
        if (confirm) {
          this.onStop()
          this.clear()
        }
      })
    } else {
      this.clear()
    }
  }

  clear() {
    this.conversationId.set(null)
    this.conversation.set(null)
    this._messages.set([])
    this.parameterValue.set({})
    this.references.set([])
    this.clearQuoteSelection()
    this.suggestionQuestions.set([])
    this.restart.emit()
  }

  onRetry() {
    this.conversation.update((state) => {
      return {
        ...state,
        status: 'busy',
        error: null
      }
    })
    this.retryMessage()
  }

  onConfirm() {
    this.conversation.update((state) => {
      return {
        ...state,
        status: 'busy',
        error: null
      }
    })
    this.resumeOperation('confirm', this.command())
  }

  /**
   * @deprecated use onConfirm with command resume instead
   */
  onReject() {
    this.conversation.update((state) => {
      return {
        ...state,
        status: 'busy',
        error: null
      }
    })
    this.resumeOperation('reject', this.command())
  }

  onClose() {
    if (this.loading()) {
      this.confirmDel({
        title: this.#translate.instant('PAC.Chat.StopGenerate', { Default: 'Stop generate' }),
        information: this.#translate.instant('PAC.Chat.PreviewStopGenerate', {
          Default: 'Closing the panel will stop generating content'
        })
      }).subscribe((confirm) => {
        if (confirm) {
          this.onStop()
          this.close.emit()
        }
      })
    } else {
      this.close.emit()
    }
  }

  onRetryMessage(message: IChatMessage) {
    // Avoid duplicate retries while a response is in progress
    if (this.loading()) {
      return
    }

    // Rollback to the target message and retry without later context
    const conversation = this.conversation()
    if (!conversation?.id) {
      this.#toastr.error('Conversation not found')
      return
    }
    const messages = this.messages()
    const targetIndex = messages?.findIndex((item) => item.id === message?.id) ?? -1
    if (targetIndex < 0) {
      this.#toastr.error('Message not found')
      return
    }

    this._messages.set(messages.slice(0, targetIndex))

    this.retryMessage(message.id)
  }

  getMessageSourceLabel(role: string | undefined): string {
    if (role === 'user' || role === 'human') {
      return this.#translate.instant('PAC.KEY_WORDS.You', { Default: 'You' })
    }

    return (
      this.xpert()?.title ||
      this.xpert()?.name ||
      this.#translate.instant('PAC.Xpert.Assistant', { Default: 'Assistant' })
    )
  }

  private updateQuoteSelection() {
    if (typeof document === 'undefined' || typeof window === 'undefined') {
      return
    }

    const selection = document.getSelection()
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      this.clearQuoteSelection()
      return
    }

    const text = selection.toString().trim()
    if (!text) {
      this.clearQuoteSelection()
      return
    }

    const host = this.#elementRef.nativeElement
    const anchorElement = toSelectionElement(selection.anchorNode)
    const focusElement = toSelectionElement(selection.focusNode)

    if (!anchorElement || !focusElement || !host.contains(anchorElement) || !host.contains(focusElement)) {
      this.clearQuoteSelection()
      return
    }

    const anchorMessage = anchorElement.closest<HTMLElement>('[data-chat-reference-message="true"]')
    const focusMessage = focusElement.closest<HTMLElement>('[data-chat-reference-message="true"]')
    if (!anchorMessage || anchorMessage !== focusMessage) {
      this.clearQuoteSelection()
      return
    }

    const range = selection.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    if (!rect.width && !rect.height) {
      this.clearQuoteSelection()
      return
    }

    const source =
      anchorMessage.dataset.messageSource?.trim() ||
      this.xpert()?.title ||
      this.xpert()?.name ||
      this.#translate.instant('PAC.Xpert.Assistant', { Default: 'Assistant' })
    const messageId = anchorMessage.dataset.messageId?.trim() || undefined
    const left = clamp(rect.left + rect.width / 2, 88, window.innerWidth - 88)
    const top = Math.max(16, rect.top - 48)

    this.quoteSelection.set({
      left,
      top,
      reference: {
        type: 'quote',
        text,
        ...(messageId ? { messageId } : {}),
        source
      }
    })
  }

  private clearQuoteSelection() {
    this.quoteSelection.set(null)
  }

  private clearBrowserSelection() {
    if (typeof document === 'undefined') {
      return
    }

    document.getSelection()?.removeAllRanges()
  }

  readonly synthesizeLoading = this.#synthesizeService.synthesizeLoading
  readonly isPlaying = this.#synthesizeService.isPlaying
  readAloud(message: IChatMessage) {
    this.#synthesizeService.readAloud(this.conversation().id, message)
  }

  readonly speeching = this.#audioRecorder.speeching
  readonly isRecording = this.#audioRecorder.isRecording
  readonly isConverting = this.#audioRecorder.isConverting
  readonly recordTimes = this.#audioRecorder.recordTimes
  async startRecording() {
    await this.#audioRecorder.startRecording()
  }
  stopRecording() {
    this.#audioRecorder.stopRecording()
  }

  // Attachments
  fileBrowseHandler(event: EventTarget & { files?: FileList }) {
    this.onFileDropped(event.files)
  }
  onFileDropped(event: FileList) {
    const filesArray = Array.from(event)
    this.attachments.update((state) => {
      while (state.length <= this.attachment_maxNum() && filesArray.length > 0) {
        if (state.length >= this.attachment_maxNum()) {
          this.#toastr.error('PAC.Chat.AttachmentsMaxNumExceeded', '', {
            Default: 'Attachments exceed the maximum number allowed.'
          })
          return [...state]
        }
        const file = filesArray.shift()
        if (state.some((_) => _.file.name === file.name)) {
          this.#toastr.error('PAC.Chat.AttachmentsAlreadyExists', '', { Default: 'Attachment already exists.' })
          continue
        }
        state.push({ file })
      }
      return [...state]
    })
  }
  onAttachCreated(file: IStorageFile) {
    //
  }
}

function toSelectionElement(node: Node | null): HTMLElement | null {
  if (!node) {
    return null
  }

  if (node instanceof HTMLElement) {
    return node
  }

  return node.parentElement
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}
