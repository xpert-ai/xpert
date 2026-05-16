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
  untracked,
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
  Store,
  AiAssistantService
} from '@cloud/app/@core'
import { EmojiAvatarComponent } from '@cloud/app/@shared/avatar'
import { XpertParametersCardComponent } from '@cloud/app/@shared/xpert'
import { MarkdownModule } from 'ngx-markdown'
import { derivedAsync } from 'ngxtension/derived-async'
import { catchError, finalize, map, Observable, of, timer, switchMap, tap, Subscription } from 'rxjs'
import { effectAction } from '@xpert-ai/ocap-angular/core'
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop'
import { injectConfirmDelete } from '@xpert-ai/ocap-angular/common'
import { XpertPreviewAiMessageComponent } from './ai-message/message.component'
import { ChatAttachmentsComponent } from '../attachments/attachments.component'
import { ChatHumanMessageComponent } from './human-message/message.component'
import { ChatFollowUpsComponent } from '../follow-ups/follow-ups.component'
import { ChatComposerMenuComponent } from '../composer/composer-menu.component'
import { ChatSlashPaletteComponent } from '../composer/slash-palette.component'
import { XpertAgentOperationComponent } from '../../agent'
import { ZardButtonComponent, ZardIconComponent, ZardTooltipImports } from '@xpert-ai/headless-ui'
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
import { getBusyComposerFollowUpMode, readFollowUpBehaviorStorageValue } from '../follow-ups/follow-ups'
import {
  buildSlashOptions,
  buildTriggerOptions,
  ChatComposerSlashOption,
  ChatRuntimeCapabilityKind,
  ChatRuntimeCapabilityOption,
  createChatCommandSource,
  findSlashOptionByInvocation,
  flattenSlashOptions,
  getSelectedRuntimeCapabilityOptions,
  getSlashCommandActionRuntimeCapabilities,
  mergeRuntimeCapabilitiesSelections,
  normalizeChatRuntimeCapabilities,
  parseSlashInvocation,
  renderSlashCommandTemplate,
  resolveSlashTrigger,
  runtimeCapabilityOptionFromCapability,
  setRuntimeCapabilitySelected,
  shouldSubmitRawSlashInvocation
} from '../composer/composer'
import type { ChatFollowUpRailItem } from '../follow-ups/follow-ups'
import type { ChatKitCommandSource, RuntimeCapabilitiesSelection } from '@xpert-ai/chatkit-types'

const LONG_TEXT_REFERENCE_THRESHOLD = 5000

function findLastAiMessageId(messages: Array<{ id?: string; role?: string }> | null | undefined): string | null {
  return [...(messages ?? [])].reverse().find((message) => message?.role === 'ai')?.id ?? null
}

function normalizePendingFollowUpTargetExecutionId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim()
  return normalized || null
}

function resolvePendingFollowUpTargetExecutionId(item: PendingFollowUp | null | undefined): string | null {
  return normalizePendingFollowUpTargetExecutionId(item?.targetExecutionId)
}

function sortPendingFollowUps(items: PendingFollowUp[]): PendingFollowUp[] {
  return [...items]
}

function getQueuedFollowUpGroup(
  items: PendingFollowUp[],
  target: PendingFollowUp | null | undefined
): PendingFollowUp[] {
  if (!target || target.mode !== 'queue') {
    return []
  }

  const sortedQueueItems = sortPendingFollowUps(items).filter((item) => item.mode === 'queue')
  const targetExecutionId = resolvePendingFollowUpTargetExecutionId(target)
  if (!targetExecutionId) {
    return sortedQueueItems.filter((item) => item.id === target.id)
  }

  return sortedQueueItems.filter((item) => resolvePendingFollowUpTargetExecutionId(item) === targetExecutionId)
}

function mergeQueuedFollowUpGroup(
  items: PendingFollowUp[],
  leadItemId?: string | null
): MergedPendingFollowUpGroup | null {
  const groupedItems = sortPendingFollowUps(items)
  if (!groupedItems.length) {
    return null
  }

  const leadItem = groupedItems.find((item) => item.id === leadItemId) ?? groupedItems[0]
  const mergedInput = groupedItems
    .map((item) => item.input)
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join('\n\n')
  const files = groupedItems.flatMap((item) => item.files ?? [])
  const references = groupedItems.flatMap((item) => item.references ?? [])
  const runtimeCapabilities = mergeRuntimeCapabilitiesSelections(
    ...groupedItems.map((item) => item.runtimeCapabilities)
  )
  const commandSource = leadItem.commandSource ?? groupedItems.find((item) => item.commandSource)?.commandSource

  return {
    items: groupedItems,
    input: mergedInput,
    ...(files.length ? { files } : {}),
    ...(references.length ? { references } : {}),
    ...(groupedItems.some((item) => item.planMode) ? { planMode: true } : {}),
    ...(runtimeCapabilities ? { runtimeCapabilities } : {}),
    ...(commandSource ? { commandSource } : {}),
    targetExecutionId: resolvePendingFollowUpTargetExecutionId(leadItem)
  }
}

type PreviewSendMetadata = {
  planMode?: boolean
  runtimeCapabilities?: RuntimeCapabilitiesSelection | null
  commandSource?: ChatKitCommandSource | null
}

type PendingFollowUp = {
  id: string
  input: string
  files?: IStorageFile[]
  references?: XpertChatReference[]
  mode: 'queue' | 'steer'
  targetExecutionId?: string | null
  planMode?: boolean
  runtimeCapabilities?: RuntimeCapabilitiesSelection | null
  commandSource?: ChatKitCommandSource | null
}

type MergedPendingFollowUpGroup = {
  items: PendingFollowUp[]
  input: string
  files?: IStorageFile[]
  references?: XpertChatReference[]
  targetExecutionId?: string | null
  planMode?: boolean
  runtimeCapabilities?: RuntimeCapabilitiesSelection | null
  commandSource?: ChatKitCommandSource | null
}

type ComposerSelectionOffsets = {
  start: number
  end: number
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
    TranslateModule,
    TextFieldModule,
    ...ZardTooltipImports,
    ZardButtonComponent,
    ZardIconComponent,
    MarkdownModule,
    EmojiAvatarComponent,
    XpertParametersCardComponent,
    XpertPreviewAiMessageComponent,
    XpertAgentOperationComponent,
    ChatAttachmentsComponent,
    ChatFollowUpsComponent,
    ChatComposerMenuComponent,
    ChatSlashPaletteComponent,
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
  readonly #assistantService = inject(AiAssistantService)
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
  readonly organizationId = input<string | null>(null)
  readonly xpert = model<Partial<IXpert>>()
  readonly input = model<string>()
  readonly environmentId = model<string>()
  readonly parameters = model<TXpertParameter[]>()
  readonly runtimeCapabilitiesSource = input<'assistant' | 'xpert'>('assistant')
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
  readonly userInputRef = viewChild('userInput', { read: ElementRef })

  // States
  readonly conversation = signal<Partial<IChatConversation>>(null)

  readonly feedbacks = signal<Record<string, IChatMessageFeedback>>({})
  readonly #feedbacks = derivedAsync(() => {
    return this.conversationId()
      ? this.messageFeedbackService
          .getMyAll({ where: { conversationId: this.conversationId() } }, this.organizationId() ?? undefined)
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
  readonly planModeEnabled = signal(false)
  readonly runtimeSelection = signal<RuntimeCapabilitiesSelection | null>(null)
  readonly runtimeSelectionOwnerId = signal<string | null>(null)
  readonly runtimeCapabilitiesLoading = signal(false)
  readonly slashRange = signal<ReturnType<typeof resolveSlashTrigger>>(null)
  readonly slashActiveIndex = signal(0)
  readonly expandedSlashGroups = signal<ChatRuntimeCapabilityKind[]>([])
  readonly runtimeCapabilities = toSignal(
    toObservable(
      computed(() => {
        const xpertId = this.xpert()?.id
        if (this.runtimeCapabilitiesSource() === 'xpert' && xpertId) {
          return {
            id: xpertId,
            source: 'xpert' as const
          }
        }

        const assistantXpertId = xpertId ?? this.conversation()?.xpert?.id
        return assistantXpertId
          ? {
              id: assistantXpertId,
              source: 'assistant' as const
            }
          : null
      })
    ).pipe(
      switchMap((target) => {
        if (!target) {
          return of(null)
        }

        this.runtimeCapabilitiesLoading.set(true)
        const request$ =
          target.source === 'xpert'
            ? this.xpertService.getRuntimeCapabilities(target.id, { isDraft: true })
            : this.#assistantService.getRuntimeCapabilities(target.id, { isDraft: true })

        return request$.pipe(
          map((capabilities) => normalizeChatRuntimeCapabilities(capabilities)),
          catchError((error) => {
            this.#toastr.error(getErrorMessage(error))
            return of(null)
          }),
          finalize(() => this.runtimeCapabilitiesLoading.set(false))
        )
      })
    ),
    {
      initialValue: null
    }
  )
  readonly selectedRuntimeCapabilityOptions = computed(() =>
    getSelectedRuntimeCapabilityOptions(this.runtimeCapabilities(), this.runtimeSelection())
  )
  readonly slashOptions = computed(() =>
    buildTriggerOptions(
      this.runtimeCapabilities()?.commands,
      this.slashRange(),
      this.runtimeCapabilities(),
      this.expandedSlashGroups(),
      this.runtimeSelection()
    )
  )
  readonly visiblePaletteOptions = computed(() => (this.slashRange() ? this.slashOptions() : []))
  readonly visiblePaletteFlatOptions = computed(() => flattenSlashOptions(this.visiblePaletteOptions()))
  readonly showSlashPalette = computed(() => Boolean(this.slashRange()))

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
          ? this.conversationService.getOneById(
              this.conversationId(),
              {
                relations: ['messages', 'messages.attachments', 'xpert', 'xpert.agent', 'xpert.agents']
              },
              this.organizationId() ?? undefined
            )
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
  readonly files = computed(() =>
    (this.attachments() ?? [])
      .map(({ storageFile }) => storageFile)
      .filter((file): file is IStorageFile => Boolean(file))
  )

  constructor() {
    effect(() => {
      if (this.#feedbacks()) {
        this.feedbacks.set(
          this.#feedbacks().reduce((acc, curr) => {
            acc[curr.messageId] = curr
            return acc
          }, {})
        )
      }
    })

    effect(() => this.#audioRecorder.canvasRef.set(this.canvasRef()))
    effect(() => this.#audioRecorder.xpert.set(this.xpert() as IXpert))
    effect(() => {
      const speechText = this.#audioRecorder.text()
      if (!speechText) {
        return
      }
      this.input.set(speechText)
      untracked(() =>
        this.updateSlashPalette(speechText, {
          start: speechText.length,
          end: speechText.length
        })
      )
    })

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

    effect(() => {
      const xpertId = this.xpert()?.id ?? this.conversation()?.xpert?.id ?? null
      if (this.runtimeSelectionOwnerId() !== xpertId) {
        this.runtimeSelectionOwnerId.set(xpertId)
        this.runtimeSelection.set(null)
        this.closePalettes()
      }
    })

    effect(() => {
      console.log(this.runtimeCapabilities())
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

  sendMessage(
    input: string | null | undefined,
    options?: { references?: XpertChatReference[]; followUpBehavior?: 'queue' | 'steer' } & PreviewSendMetadata
  ) {
    if ((input ?? '') === (this.input() ?? '') && this.executeSlashCommandFromDraft()) {
      return
    }

    const content = input?.trim() ?? ''
    const references = options?.references ?? []
    if (!content && !references.length) {
      return
    }

    this.chat({
      input: content,
      references,
      followUpBehavior: options?.followUpBehavior,
      planMode: options?.planMode,
      runtimeCapabilities: options?.runtimeCapabilities,
      commandSource: options?.commandSource
    })
  }

  chat(
    options?: {
      input?: string
      confirm?: boolean
      files?: IStorageFile[]
      references?: XpertChatReference[]
      messageId?: string
      queuedFollowUpGroup?: MergedPendingFollowUpGroup | null
      command?: TInterruptCommand
      /**
       * @deprecated use confirm with command resume instead
       */
      reject?: boolean
      retry?: boolean
      checkpointId?: string
      followUpBehavior?: 'queue' | 'steer'
    } & PreviewSendMetadata
  ) {
    if (this.loading()) {
      if (
        (!options?.input && !options?.references?.length) ||
        this.conversationStatus() === XpertAgentExecutionStatusEnum.INTERRUPTED
      ) {
        return
      }

      const runtimeCapabilities =
        options?.runtimeCapabilities === undefined
          ? this.getRuntimeCapabilitiesForSubmit()
          : options.runtimeCapabilities
      const planMode = options?.planMode ?? this.planModeEnabled()
      void this.enqueueFollowUp({
        id: options?.messageId ?? uuid(),
        input: options.input ?? '',
        files: options?.files ?? this.files(),
        references: options?.references,
        mode: options?.followUpBehavior ?? this.followUpBehavior(),
        targetExecutionId: this.currentMessage()?.executionId ?? this.lastMessage()?.executionId ?? null,
        ...(planMode ? { planMode: true } : {}),
        ...(runtimeCapabilities ? { runtimeCapabilities } : {}),
        ...(options?.commandSource ? { commandSource: options.commandSource } : {})
      })
      return
    }

    this.suggestionQuestions.set([]) // Clear suggestions after selection
    this.loading.set(true)
    this.messageAppendContextTracker.reset()

    const requestFiles = options?.files ?? this.files()
    const shouldClearAttachments = !options?.files
    const references = options?.references ?? []
    const queuedFollowUpGroup = options?.queuedFollowUpGroup
    const runtimeCapabilities =
      options?.runtimeCapabilities === undefined ? this.getRuntimeCapabilitiesForSubmit() : options.runtimeCapabilities
    const planMode = options?.planMode ?? this.planModeEnabled()
    const commandSource = options?.commandSource ?? null

    const shouldAppendHuman = !!options?.input?.trim() || references.length > 0
    if (shouldAppendHuman) {
      if (queuedFollowUpGroup?.items?.length) {
        queuedFollowUpGroup.items.forEach((item) => {
          this.appendMessage({
            role: 'human',
            content: item.input ?? '',
            id: item.id,
            ...(item.references?.length
              ? {
                  references: item.references
                }
              : {}),
            attachments: item.files,
            ...(item.planMode || item.runtimeCapabilities || item.commandSource
              ? {
                  thirdPartyMessage: {
                    ...(item.planMode ? { planMode: true } : {}),
                    ...(item.runtimeCapabilities ? { runtimeCapabilities: item.runtimeCapabilities } : {}),
                    ...(item.commandSource ? { commandSource: item.commandSource } : {})
                  }
                }
              : {})
          })
        })
      } else {
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
          attachments: requestFiles,
          ...(planMode || runtimeCapabilities || commandSource
            ? {
                thirdPartyMessage: {
                  ...(planMode ? { planMode: true } : {}),
                  ...(runtimeCapabilities ? { runtimeCapabilities } : {}),
                  ...(commandSource ? { commandSource } : {})
                }
              }
            : {})
        })
      }
      this.input.set('')
      this.references.set([])
      this.runtimeSelection.set(null)
      this.closePalettes()
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
            }),
            ...(planMode ? { planMode: true } : {}),
            ...(runtimeCapabilities ? { runtimeCapabilities } : {}),
            ...(commandSource ? { commandSource } : {})
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
                      if (followUpConsumedEvent.mode === 'steer') {
                        if (this.currentMessage()) {
                          this.appendMessage({ ...this.currentMessage() })
                          this.currentMessage.set(null)
                        }
                        this.flushPendingSteerFollowUps(resolveFollowUpConsumedIds(followUpConsumedEvent))
                        this.shouldStartFreshAssistantMessageAfterSteer = true
                      } else {
                        this.removePendingQueuedFollowUps(resolveFollowUpConsumedIds(followUpConsumedEvent))
                      }
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
    if (event.isComposing) {
      return
    }

    if (this.showSlashPalette() && this.handlePaletteKeydown(event)) {
      return
    }

    if (
      (event.key === 'Backspace' || event.key === 'Delete') &&
      !this.input() &&
      this.selectedRuntimeCapabilityOptions().length
    ) {
      event.preventDefault()
      const option =
        event.key === 'Backspace'
          ? this.selectedRuntimeCapabilityOptions()[this.selectedRuntimeCapabilityOptions().length - 1]
          : this.selectedRuntimeCapabilityOptions()[0]
      this.removeRuntimeCapability(option)
      return
    }

    if (event.key !== 'Enter' || event.shiftKey) {
      return
    }

    event.preventDefault()
    if (this.executeSlashCommandFromDraft()) {
      return
    }

    if (!this.input()?.trim() && !this.hasReferences()) {
      return
    }

    this.sendMessage(this.input(), {
      references: this.references(),
      followUpBehavior: this.loading() ? getBusyComposerFollowUpMode(event) : this.followUpBehavior()
    })
  }

  onInputChange(event?: Event) {
    const target = event?.target as HTMLTextAreaElement | null | undefined
    const textarea =
      target && typeof target.value === 'string' && typeof target.selectionStart === 'number'
        ? target
        : (this.userInputRef()?.nativeElement as HTMLTextAreaElement | undefined)
    const text = textarea?.value ?? this.input() ?? ''
    if (text !== (this.input() ?? '')) {
      this.input.set(text)
    }

    this.updateSlashPalette(
      text,
      textarea
        ? {
            start: textarea.selectionStart,
            end: textarea.selectionEnd
          }
        : null
    )
  }

  onInputSelectionChange() {
    this.updateSlashPalette()
  }

  onInputPaste(event: ClipboardEvent) {
    const clipboardData = event.clipboardData
    if (!clipboardData) {
      return
    }

    const imageFiles = Array.from(clipboardData.items ?? [])
      .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file))

    if (imageFiles.length) {
      event.preventDefault()
      this.addFiles(imageFiles)
      return
    }

    const pastedText = clipboardData.getData('text/plain')
    if (!pastedText) {
      return
    }

    if (pastedText.trim().length <= LONG_TEXT_REFERENCE_THRESHOLD) {
      return
    }

    event.preventDefault()
    this.addReferences([
      {
        type: 'quote',
        source: this.#translate.instant('PAC.Chat.PastedText', { Default: 'Pasted text' }),
        text: pastedText
      }
    ])
  }

  setPlanMode(enabled: boolean) {
    this.planModeEnabled.set(enabled)
    this.focusInput()
  }

  setRuntimeSelection(selection: RuntimeCapabilitiesSelection | null) {
    this.runtimeSelection.set(selection)
    this.focusInput()
  }

  removeRuntimeCapability(option: ChatRuntimeCapabilityOption) {
    this.runtimeSelection.set(setRuntimeCapabilitySelected(this.runtimeSelection(), option, false, option.workspaceId))
    this.focusInput()
  }

  choosePaletteOption(option: ChatComposerSlashOption) {
    if (option.type === 'capability' && option.capability) {
      this.runtimeSelection.set(
        setRuntimeCapabilitySelected(this.runtimeSelection(), option.capability, true, option.capability.workspaceId)
      )
      const slashRange = this.slashRange()
      if (slashRange) {
        this.replaceInputRange(slashRange, '')
      }
      this.closePalettes()
      this.focusInput()
      return
    }

    if (option.builtin?.group) {
      this.toggleSlashGroup(option.builtin.group)
      return
    }

    this.executeSlashOption(option, '', this.slashRange())
  }

  setSlashActiveIndex(index: number) {
    this.slashActiveIndex.set(index)
  }

  setFollowUpBehavior(behavior: 'queue' | 'steer') {
    this.followUpBehavior.set(behavior)
  }

  removePendingFollowUp(id: string) {
    this.pendingFollowUps.update((state) => (state ?? []).filter((item) => item.id !== id))
  }

  sendPendingFollowUpNow(id: string) {
    this.drainQueuedFollowUps(id)
  }

  promotePendingFollowUpToSteer(id: string) {
    const item = this.pendingFollowUps().find((entry) => entry.id === id)
    if (!item || item.mode === 'steer') {
      return
    }

    const steerItem: PendingFollowUp = {
      ...item,
      mode: 'steer'
    }
    this.pendingFollowUps.update((state) => (state ?? []).map((entry) => (entry.id === id ? steerItem : entry)))

    if (this.loading() && this.conversation()?.id) {
      this.requestSteerFollowUp(steerItem)
    }
  }

  editPendingFollowUp(item?: ChatFollowUpRailItem) {
    const content = (item?.input ?? item?.content ?? '').trim()
    if (!item || (!content && !item.references?.length)) {
      return
    }

    this.followUpBehavior.set(item.mode)
    const pendingItem = item as PendingFollowUp
    if (pendingItem.planMode) {
      this.planModeEnabled.set(true)
    }
    if (pendingItem.runtimeCapabilities) {
      this.runtimeSelection.set(pendingItem.runtimeCapabilities)
    }
    this.input.set(content)
    this.references.set(item.references ?? [])
    if (item.id) {
      this.pendingFollowUps.update((state) => (state ?? []).filter((entry) => entry.id !== item.id))
    }

    queueMicrotask(() => {
      const textarea = this.userInputRef()?.nativeElement as HTMLTextAreaElement | undefined
      textarea?.focus()
      textarea?.setSelectionRange(textarea.value.length, textarea.value.length)
    })
  }

  turnOffFollowUpQueueing() {
    this.setFollowUpBehavior('steer')
  }

  private enqueueFollowUp(item: PendingFollowUp) {
    this.pendingFollowUps.update((state) => [...(state ?? []).filter((entry) => entry.id !== item.id), item])
    this.input.set('')
    this.attachments.set([])
    this.references.set([])
    this.runtimeSelection.set(null)
    this.closePalettes()

    if (item.mode === 'steer') {
      this.requestSteerFollowUp(item)
    }
  }

  private requestSteerFollowUp(item: PendingFollowUp) {
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
          }),
          ...(item.planMode ? { planMode: true } : {}),
          ...(item.runtimeCapabilities ? { runtimeCapabilities: item.runtimeCapabilities } : {}),
          ...(item.commandSource ? { commandSource: item.commandSource } : {})
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
    const steerItems = this.pendingFollowUps().filter((item) => item.mode === 'steer' && idSet.has(item.id))

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
        attachments: item.files,
        ...(item.planMode || item.runtimeCapabilities || item.commandSource
          ? {
              thirdPartyMessage: {
                ...(item.planMode ? { planMode: true } : {}),
                ...(item.runtimeCapabilities ? { runtimeCapabilities: item.runtimeCapabilities } : {}),
                ...(item.commandSource ? { commandSource: item.commandSource } : {})
              }
            }
          : {})
      })
    })
    this.pendingFollowUps.update((state) =>
      (state ?? []).filter((item) => !(item.mode === 'steer' && idSet.has(item.id)))
    )
  }

  private removePendingQueuedFollowUps(ids: string[]) {
    if (!ids.length) {
      return
    }

    const idSet = new Set(ids)
    this.pendingFollowUps.update((state) =>
      (state ?? []).filter((item) => !(item.mode === 'queue' && idSet.has(item.id)))
    )
  }

  private downgradePendingSteerFollowUpsToQueue() {
    this.pendingFollowUps.update((state) =>
      (state ?? []).map((item) => (item.mode === 'steer' ? { ...item, mode: 'queue' } : item))
    )
  }

  private drainQueuedFollowUps(leadItemId?: string) {
    if (this.loading()) {
      return
    }

    const next = leadItemId
      ? this.pendingFollowUps().find((item) => item.id === leadItemId && item.mode === 'queue')
      : this.pendingFollowUps().find((item) => item.mode === 'queue')
    if (!next) {
      return
    }

    const groupedItems = getQueuedFollowUpGroup(this.pendingFollowUps(), next)
    const mergedGroup = mergeQueuedFollowUpGroup(groupedItems, next.id)
    if (!mergedGroup) {
      return
    }

    const groupedIds = new Set(mergedGroup.items.map((item) => item.id))
    this.pendingFollowUps.update((state) => (state ?? []).filter((item) => !groupedIds.has(item.id)))
    this.chat({
      input: mergedGroup.input,
      files: mergedGroup.files,
      references: mergedGroup.references,
      messageId: next.id,
      queuedFollowUpGroup: mergedGroup,
      planMode: mergedGroup.planMode ?? false,
      runtimeCapabilities: mergedGroup.runtimeCapabilities ?? null,
      commandSource: mergedGroup.commandSource ?? null
    })
  }

  private handlePaletteKeydown(event: KeyboardEvent) {
    const options = this.visiblePaletteFlatOptions()
    if (event.key === 'Escape') {
      event.preventDefault()
      this.closePalettes()
      return true
    }

    if (event.key === 'ArrowDown' || event.key === 'Tab') {
      event.preventDefault()
      this.slashActiveIndex.set(options.length ? (this.slashActiveIndex() + 1) % options.length : 0)
      return true
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      this.slashActiveIndex.set(options.length ? (this.slashActiveIndex() - 1 + options.length) % options.length : 0)
      return true
    }

    if (event.key === 'Enter' && !event.shiftKey && options.length) {
      event.preventDefault()
      this.choosePaletteOption(options[Math.min(this.slashActiveIndex(), options.length - 1)])
      return true
    }

    return false
  }

  private executeSlashCommandFromDraft() {
    const draft = this.input()?.trim() ?? ''
    const invocation = parseSlashInvocation(draft)
    if (!invocation) {
      return false
    }

    const option = findSlashOptionByInvocation(
      buildSlashOptions(this.runtimeCapabilities()?.commands, '', this.runtimeCapabilities()),
      invocation
    )
    if (!option) {
      return false
    }

    if (shouldSubmitRawSlashInvocation(option)) {
      return false
    }

    return this.executeSlashOption(option, invocation.args, {
      trigger: '/',
      start: 0,
      end: this.input()?.length ?? 0,
      query: invocation.name
    })
  }

  private executeSlashOption(
    option: ChatComposerSlashOption,
    args: string,
    range: ReturnType<typeof resolveSlashTrigger>
  ) {
    if (option.disabled || option.disabledReason || option.disabledReasonKey) {
      return true
    }

    const commandSource = createChatCommandSource(option)
    if (option.builtin?.command === 'plan') {
      if (args) {
        this.chat({
          input: args,
          references: this.references(),
          followUpBehavior: this.followUpBehavior(),
          planMode: true,
          commandSource
        })
      } else {
        this.planModeEnabled.update((enabled) => !enabled)
        this.replaceInputRange(range ?? { start: 0, end: this.input()?.length ?? 0 }, '')
        this.closePalettes()
      }
      return true
    }

    if (option.builtin?.group) {
      this.toggleSlashGroup(option.builtin.group)
      return true
    }

    const action = option.command?.action
    if (!action || action.type === 'client_action') {
      return true
    }

    const actionRuntimeCapabilities = getSlashCommandActionRuntimeCapabilities(action)
    if (actionRuntimeCapabilities) {
      this.runtimeSelection.set(mergeRuntimeCapabilitiesSelections(this.runtimeSelection(), actionRuntimeCapabilities))
    }

    if (action.type === 'insert_text' || action.type === 'insert_invocation') {
      this.replaceInputRange(
        range ?? { start: 0, end: this.input()?.length ?? 0 },
        renderSlashCommandTemplate(action.template, args)
      )
      this.closePalettes()
      return true
    }

    if (action.type === 'submit_prompt') {
      this.chat({
        input: renderSlashCommandTemplate(action.template, args),
        references: this.references(),
        followUpBehavior: this.followUpBehavior(),
        runtimeCapabilities: this.getRuntimeCapabilitiesForSubmit(actionRuntimeCapabilities),
        commandSource
      })
      return true
    }

    if (action.type === 'select_capability') {
      const capability = runtimeCapabilityOptionFromCapability(this.runtimeCapabilities(), action.capability)
      if (capability) {
        this.runtimeSelection.set(
          setRuntimeCapabilitySelected(this.runtimeSelection(), capability, true, capability.workspaceId)
        )
      }
      this.replaceInputRange(range ?? { start: 0, end: this.input()?.length ?? 0 }, '')
      this.closePalettes()
      return true
    }

    return true
  }

  private getRuntimeCapabilitiesForSubmit(extra?: RuntimeCapabilitiesSelection | null) {
    return mergeRuntimeCapabilitiesSelections(this.runtimeSelection(), extra)
  }

  private updateSlashPalette(textOverride?: string, selectionOverride?: ComposerSelectionOffsets | null) {
    const selection = selectionOverride === undefined ? this.getInputSelectionOffsets() : selectionOverride
    const text = textOverride ?? this.input() ?? ''
    const nextRange = resolveSlashTrigger(text, selection?.start ?? text.length)
    const previousRange = this.slashRange()
    this.slashRange.set(nextRange)
    if (previousRange?.trigger !== nextRange?.trigger || previousRange?.query !== nextRange?.query) {
      this.slashActiveIndex.set(0)
      this.expandedSlashGroups.set([])
    }
  }

  private closePalettes() {
    this.slashRange.set(null)
    this.expandedSlashGroups.set([])
    this.slashActiveIndex.set(0)
  }

  private toggleSlashGroup(group: ChatRuntimeCapabilityKind) {
    this.expandedSlashGroups.update((groups) =>
      groups.includes(group) ? groups.filter((item) => item !== group) : [...groups, group]
    )
    this.slashActiveIndex.set(0)
  }

  private replaceInputRange(range: ComposerSelectionOffsets, text: string) {
    const current = this.input() ?? ''
    const start = Math.max(0, Math.min(range.start, current.length))
    const end = Math.max(start, Math.min(range.end, current.length))
    const next = `${current.slice(0, start)}${text}${current.slice(end)}`
    this.input.set(next)
    this.updateSlashPalette()
    queueMicrotask(() => {
      this.focusInput()
      this.setInputSelection(start + text.length, start + text.length)
    })
  }

  private focusInput() {
    const textarea = this.userInputRef()?.nativeElement as HTMLTextAreaElement | undefined
    textarea?.focus()
  }

  private getInputSelectionOffsets(): ComposerSelectionOffsets | null {
    const textarea = this.userInputRef()?.nativeElement as HTMLTextAreaElement | undefined
    if (!textarea || typeof textarea.selectionStart !== 'number' || typeof textarea.selectionEnd !== 'number') {
      return null
    }

    return {
      start: textarea.selectionStart,
      end: textarea.selectionEnd
    }
  }

  private setInputSelection(start: number, end: number) {
    const textarea = this.userInputRef()?.nativeElement as HTMLTextAreaElement | undefined
    textarea?.setSelectionRange(start, end)
  }

  private getFollowUpStorageKey() {
    return `xpert:agent-chat:follow-up-behavior:${this.#store.organizationId ?? 'tenant'}:${this.#store.userId ?? 'anonymous'}`
  }

  private readPersistedFollowUpBehavior(): 'queue' | 'steer' {
    if (typeof localStorage === 'undefined') {
      return 'queue'
    }

    return readFollowUpBehaviorStorageValue(localStorage.getItem(this.getFollowUpStorageKey()))
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
  onFileDropped(event?: FileList | null) {
    this.addFiles(event ? Array.from(event) : [])
  }
  onAttachCreated(file: IStorageFile) {
    void file
  }
  onAttachDeleted(fileId: string) {
    void fileId
  }
  addAttachment(file: IStorageFile) {
    this.attachments.update((state) => {
      const attachments = state ?? []
      if (attachments.some((attachment) => attachment.storageFile?.id === file.id)) {
        return attachments
      }

      return [...attachments, { storageFile: file }]
    })
  }

  private addFiles(files: File[]) {
    if (!files.length) {
      return
    }

    const filesArray = [...files]
    this.attachments.update((state) => {
      const attachments = [...(state ?? [])]
      while (attachments.length <= this.attachment_maxNum() && filesArray.length > 0) {
        if (attachments.length >= this.attachment_maxNum()) {
          this.#toastr.error('PAC.Chat.AttachmentsMaxNumExceeded', '', {
            Default: 'Attachments exceed the maximum number allowed.'
          })
          return attachments
        }
        const file = filesArray.shift()
        if (!file) {
          continue
        }
        if (
          attachments.some(
            (attachment) => attachment.file?.name === file.name || attachment.storageFile?.originalName === file.name
          )
        ) {
          this.#toastr.error('PAC.Chat.AttachmentsAlreadyExists', '', { Default: 'Attachment already exists.' })
          continue
        }
        attachments.push({ file })
      }
      return attachments
    })
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
