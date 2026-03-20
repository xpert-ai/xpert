import { HttpErrorResponse } from '@angular/common/http'
import { computed, DestroyRef, effect, inject, Injectable, signal } from '@angular/core'
import { linkedModel } from '@metad/core'
import { omit, uniq } from 'lodash-es'
import { NGXLogger } from 'ngx-logger'
import { derivedAsync } from 'ngxtension/derived-async'
import { catchError, combineLatest, map, of, startWith, Subscription } from 'rxjs'
import {
  appendMessageContent,
  ChatMessageEventTypeEnum,
  ChatMessageTypeEnum,
  createMessageAppendContextTracker,
  getErrorMessage,
  IChatConversation,
  IChatMessageFeedback,
  IKnowledgebase,
  IStorageFile,
  IXpert,
  IXpertProject,
  IXpertToolset,
  shortTitle,
  TChatMessageStep,
  TChatOptions,
  TChatRequest,
  TXpertChatResumeDecision,
  TThreadContextUsageEvent,
  TInterruptCommand,
  TMessageAppendContext,
  TMessageContent,
  uuid,
  XpertAgentExecutionStatusEnum
} from '../@core'
import {
  ChatConversationService,
  ChatMessageFeedbackService,
  ChatMessageService,
  ChatService as ChatServerService,
  ToastrService,
  XpertAPIService
} from '../@core/services'
import { AppService } from '../app.service'
import { filterLatestMessages } from '../@shared/chat/filter-latest-messages'
import { buildResumeDecision, extractInterruptPatch } from '../@shared/chat/interrupt-request'
import { XpertHomeService } from './home.service'
import { isThreadContextUsageEvent, upsertThreadContextUsage } from '../@shared/chat/context/thread-context-usage'
import { TCopilotChatMessage } from './types'

function findLastAiMessageId(messages: Array<{ id?: string; role?: string }> | null | undefined): string | null {
  return [...(messages ?? [])].reverse().find((message) => message?.role === 'ai')?.id ?? null
}

function createRetryPlaceholderMessage(): TCopilotChatMessage {
  return {
    id: uuid(),
    role: 'ai',
    content: '',
    status: 'thinking'
  }
}

/**
 * The context of a single chat is not shared between conversations
 */
@Injectable()
export abstract class ChatService {
  readonly chatService = inject(ChatServerService)
  readonly conversationService = inject(ChatConversationService)
  readonly feedbackService = inject(ChatMessageFeedbackService)
  readonly chatMessageService = inject(ChatMessageService)
  readonly xpertService = inject(XpertAPIService)
  readonly appService = inject(AppService)
  readonly homeService = inject(XpertHomeService)
  readonly #logger = inject(NGXLogger)
  readonly #toastr = inject(ToastrService)
  readonly #destroyRef = inject(DestroyRef)

  // Current conv id
  readonly conversationId = this.homeService.conversationId

  /**
   * User feedbacks for messages of the conversation
   */
  readonly feedbacks = signal<Record<string, IChatMessageFeedback>>(null)

  /**
   * @deprecated 需重构使用方式
   */
  readonly knowledgebases = signal<IKnowledgebase[]>([])
  /**
   * @deprecated 需重构使用方式
   */
  readonly toolsets = signal<IXpertToolset[]>([])

  readonly answering = signal<boolean>(false)
  readonly contextUsageByAgentKey = signal<Record<string, TThreadContextUsageEvent>>({})
  protected chatSubscription: Subscription = null
  private readonly messageAppendContextTracker = createMessageAppendContextTracker()

  readonly lang = this.appService.lang

  // loading conversation from remote by id
  readonly #conversation = derivedAsync<{
    conversation?: IChatConversation
    feedbacks?: Record<string, IChatMessageFeedback>
    loading: boolean
  }>(() => {
    const id = this.conversationId()
    return id
      ? combineLatest([
          this.fetchConversation(id).pipe(
            catchError((httpError: HttpErrorResponse) => {
              if (httpError.status === 404) {
                this.#toastr.error('PAC.Messages.NoPermissionOrNotExist', 'PAC.KEY_WORDS.Conversation', {
                  Default: 'No permission or does not exist'
                })
              } else {
                this.#toastr.error(getErrorMessage(httpError))
              }
              return of(null)
            })
          ),
          this.getFeedbacks(id).pipe(
            map((feedbacks) =>
              feedbacks?.items.reduce((acc, feedback) => {
                acc[feedback.messageId] = feedback
                return acc
              }, {})
            )
          )
        ]).pipe(
          map<[IChatConversation, Record<string, IChatMessageFeedback>], { loading: boolean }>(
            ([conversation, feedbacks]) => {
              return {
                conversation: conversation
                  ? {
                      ...conversation,
                      messages: filterLatestMessages(conversation.messages),
                      title: conversation.title || shortTitle(conversation.options?.parameters?.input)
                    }
                  : null,
                feedbacks,
                loading: false
              }
            }
          ),
          catchError((error) => {
            this.#toastr.error(getErrorMessage(error))
            return of({ loading: false })
          }),
          startWith({
            loading: true
          })
        )
      : of({ loading: false })
  })

  /**
   * The conversation
   */
  readonly conversation = signal<IChatConversation>(null)
  readonly loadingConv = linkedModel({
    initialValue: null,
    compute: () => {
      return this.#conversation()?.loading
    },
    update: () => {
      //
    }
  })

  readonly #messages = linkedModel<TCopilotChatMessage[]>({
    initialValue: null,
    compute: () => this.conversation()?.messages,
    update: (value) => {
      this.conversation.update((state) => ({ ...(state ?? {}), messages: value }) as IChatConversation)
    }
  })

  readonly messages = computed(() => this.#messages() ?? [])

  readonly parametersValue = linkedModel<Record<string, unknown>>({
    initialValue: null,
    compute: () => this.conversation()?.options?.parameters ?? {},
    update: (value) => {
      this.conversation.update(
        (state) =>
          ({
            ...(state ?? {}),
            options: {
              ...(state?.options ?? {}),
              parameters: value
            }
          }) as IChatConversation
      )
    }
  })

  readonly xpert = signal<IXpert>(null)
  readonly project = signal<IXpertProject>(null)
  readonly suggestion_enabled = computed(() => this.xpert()?.features?.suggestion?.enabled)

  // Attachments
  readonly attachments = signal<{ file?: File; url?: string; storageFile?: IStorageFile }[]>([])
  readonly recentAttachments = signal<IStorageFile[]>(null)

  constructor() {
    this.#destroyRef.onDestroy(() => {
      if (this.answering() && this.conversation()?.id) {
        this.cancelMessage()
      }
    })

    effect(
      () => {
        if (this.conversation()?.xpert && !this.xpert()) {
          this.xpert.set(this.conversation().xpert)
        }
      },
      { allowSignalWrites: true }
    )

    effect(
      () => {
        // Update local data when remote conversation loaded
        const conversation = this.#conversation()?.conversation
        if (conversation) {
          if (!this.conversation() || (this.conversation()?.id && this.conversation().id !== conversation.id)) {
            this.conversation.set(conversation)
          }
        }
      },
      { allowSignalWrites: true }
    )

    effect(
      () => {
        // Sync feedbacks from remote conversation to local signal
        const feedbacks = this.#conversation()?.feedbacks
        if (feedbacks !== undefined) {
          this.feedbacks.set(feedbacks ?? null)
        }
      },
      { allowSignalWrites: true }
    )

    effect(
      () => {
        if (!this.conversationId()) {
          this.suggestionQuestions.set([])
          this.contextUsageByAgentKey.set({})
        }
      },
      { allowSignalWrites: true }
    )

    // effect(() => {
    //   console.log('ChatService: conversation changed', this.conversation(), this.#messages())
    // })
  }

  fetchConversation(id: string) {
    return this.conversationService.getById(id, {
      relations: [
        'xpert',
        'xpert.copilotModel',
        'xpert.agent',
        'xpert.agents',
        'xpert.knowledgebases',
        'xpert.toolsets',
        'messages',
        'messages.execution',
        'messages.attachments',
        'task'
      ]
    })
  }

  getFeedbacks(id: string) {
    return this.feedbackService.getMyAll({ where: { conversationId: id } })
  }

  ask(content: string, params: { files: { id: string }[] }) {
    const id = uuid()
    const humanMessage: TCopilotChatMessage = {
      id,
      role: 'user',
      content
    }
    if (params?.files?.length) {
      humanMessage.attachments = params.files as IStorageFile[]
    }
    this.appendMessage(humanMessage)
    this.sendMessage({ id, content, files: params.files })
  }

  chatRequest(name: string, request: TChatRequest, options: TChatOptions) {
    if (this.project() && (!('action' in request) || request.action === 'send')) {
      request.projectId = this.project().id
    }
    return this.chatService.chat(request, options)
  }

  sendMessage(options: { id?: string; content: string; files?: Partial<IStorageFile>[] }) {
    const request: TChatRequest = {
      action: 'send',
      conversationId: this.conversation()?.id,
      projectId: this.project()?.id,
      message: {
        clientMessageId: options.id,
        input: {
          ...(this.parametersValue() ?? {}),
          input: options.content,
          files: options.files
        }
      }
    }

    this.executeChatRequest(request, {
      mode: 'send',
      content: options.content
    })
  }

  resumeOperation(options?: { decision?: TXpertChatResumeDecision['type']; command?: TInterruptCommand }) {
    const conversationId = this.conversation()?.id
    const aiMessageId = findLastAiMessageId(this.messages())
    if (!conversationId || !aiMessageId) {
      this.#toastr.error('Conversation not found')
      return
    }

    const patch = extractInterruptPatch(options?.command)
    const request: TChatRequest = {
      action: 'resume',
      conversationId,
      target: {
        aiMessageId
      },
      decision: buildResumeDecision(options?.decision ?? 'confirm', options?.command),
      ...(patch ? { patch } : {})
    }

    this.executeChatRequest(request, {
      mode: 'resume'
    })
  }

  retryMessage(messageId?: string) {
    const conversationId = this.conversation()?.id
    const messages = this.messages()
    const aiMessageId = messageId ?? findLastAiMessageId(messages)
    if (!conversationId || !aiMessageId) {
      this.#toastr.error('Conversation not found')
      return
    }

    const targetIndex = messages.findIndex((message) => message?.id === aiMessageId)
    if (targetIndex < 0) {
      this.#toastr.error('Message not found')
      return
    }

    this.#messages.set(messages.slice(0, targetIndex))

    const request: TChatRequest = {
      action: 'retry',
      conversationId,
      source: {
        aiMessageId
      }
    }

    this.executeChatRequest(request, {
      mode: 'retry',
      messageId: aiMessageId
    })
  }

  chat(
    options: Partial<{
      id: string
      /**
       * Human text input
       */
      content: string
      /**
       * Attachment files
       */
      files: Partial<IStorageFile>[]
      confirm: boolean
      command: TInterruptCommand
      /**
       * @deprecated use onConfirm with command resume instead
       */
      reject: boolean
      retry: boolean
      messageId?: string
    }>
  ) {
    if (options.retry) {
      this.retryMessage(options.messageId)
      return
    }

    if (options.confirm || options.reject || options.command) {
      this.resumeOperation({
        decision: options.reject ? 'reject' : 'confirm',
        command: options.command
      })
      return
    }

    if (options.content) {
      this.sendMessage({
        id: options.id,
        content: options.content,
        files: options.files
      })
    }
  }

  private executeChatRequest(
    request: TChatRequest,
    options: {
      mode: 'send' | 'resume' | 'retry'
      content?: string
      messageId?: string
    }
  ) {
    // Clear previous suggestion questions when starting a new round of chat.
    // Purpose: avoid showing stale suggestions until the current round generates new ones.
    if (this.suggestion_enabled()) {
      this.suggesting.set(false)
      this.suggestionQuestions.set([])
    }

    this.answering.set(true)
    this.messageAppendContextTracker.reset()
    this.conversation.update((state) => ({ ...(state ?? {}), status: 'busy', error: null }) as IChatConversation)

    if (options.mode === 'resume') {
      this.updateLatestMessage((message) => {
        return {
          ...message,
          status: 'thinking'
        }
      })
    } else if (options.mode === 'retry') {
      this.appendMessage(createRetryPlaceholderMessage())
    } else if (options.mode === 'send' && options.content) {
      // Add ai message placeholder
      // this.appendMessage({
      //   id: uuid(),
      //   role: 'assistant',
      //   content: ``,
      //   status: 'thinking'
      // })
    }

    this.chatSubscription = this.chatRequest(this.xpert()?.slug, request, {
      xpertId: this.xpert()?.id,
      messageId: options.messageId
    }).subscribe({
      next: (msg) => {
        if (msg.event === 'error') {
          this.#toastr.error(msg.data)
        } else {
          if (msg.data) {
            // Ignore non-data events
            if (msg.data.startsWith(':')) {
              return
            }
            const event = JSON.parse(msg.data)
            if (event.type === ChatMessageTypeEnum.MESSAGE) {
              const latestMessageId = this.messages()[this.messages().length - 1]?.id
              const { messageContext } = this.messageAppendContextTracker.resolve({
                incoming: event.data,
                fallbackSource: typeof event.data === 'string' ? 'chat_stream' : undefined,
                fallbackStreamId: String(latestMessageId ?? this.conversation()?.id ?? 'chat_stream')
              })

              if (typeof event.data === 'string') {
                this.appendStreamMessage(event.data, messageContext)
              } else {
                this.appendMessageComponent(event.data, messageContext)
              }
            } else if (event.type === ChatMessageTypeEnum.EVENT) {
              switch (event.event) {
                case ChatMessageEventTypeEnum.ON_CONVERSATION_START:
                case ChatMessageEventTypeEnum.ON_CONVERSATION_END:
                  this.updateConversation(omit(event.data, 'messages'))
                  if (event.data.status === 'error') {
                    this.updateLatestMessage((lastM) => {
                      return {
                        ...lastM,
                        status: XpertAgentExecutionStatusEnum.ERROR
                      }
                    })
                  }
                  break
                case ChatMessageEventTypeEnum.ON_MESSAGE_START:
                  if (options.mode === 'send' && options.content) {
                    this.appendMessage({
                      id: uuid(),
                      role: 'ai',
                      content: ``,
                      status: 'thinking'
                    })
                  }
                  this.updateLatestMessage((lastM) => {
                    return {
                      ...lastM,
                      ...event.data
                    }
                  })
                  break
                case ChatMessageEventTypeEnum.ON_MESSAGE_END:
                  this.updateLatestMessage((lastM) => {
                    return {
                      ...lastM,
                      status: event.data.status,
                      error: event.data.error
                    }
                  })
                  break
                case ChatMessageEventTypeEnum.ON_AGENT_START:
                case ChatMessageEventTypeEnum.ON_AGENT_END: {
                  const execution = event.data
                  this.updateLatestMessage((message) => {
                    const executions = (message.executions ?? []).filter((_) => _.id !== execution.id)
                    return {
                      ...message,
                      executions: executions.concat(execution)
                    }
                  })
                  break
                }
                case ChatMessageEventTypeEnum.ON_CHAT_EVENT: {
                  if (isThreadContextUsageEvent(event.data)) {
                    this.setContextUsage(event.data)
                    break
                  }

                  if (event.data?.type === 'sandbox') {
                    this.conversation.update((conversation) => {
                      return {
                        ...conversation,
                        options: {
                          ...(conversation.options ?? {}),
                          features: uniq([...(conversation.options?.features ?? []), 'sandbox'])
                        }
                      }
                    })
                  }
                  this.updateLatestMessage((message) => {
                    message.events ??= []
                    const step = event.data as TChatMessageStep
                    if (step?.id) {
                      const index = message.events.findIndex((_) => _.id === step.id)
                      if (index > -1) {
                        message.events[index] = {
                          ...message.events[index],
                          ...step
                        }
                        return {
                          ...message,
                          events: [...message.events]
                        }
                      }
                    }

                    return {
                      ...message,
                      events: [...(message.events ?? []), event.data]
                    }
                  })
                  break
                }
                default:
                  this.updateEvent(event)
              }
            }
          }
        }
      },
      error: (error) => {
        this.answering.set(false)
        this.messageAppendContextTracker.reset()
        this.#toastr.error(getErrorMessage(error))
        this.updateLatestMessage((message) => {
          return {
            ...message,
            status: XpertAgentExecutionStatusEnum.ERROR,
            error: getErrorMessage(error)
          }
        })
      },
      complete: () => {
        this.answering.set(false)
        this.messageAppendContextTracker.reset()
        this.updateLatestMessage((message) => {
          return {
            ...message,
            status: XpertAgentExecutionStatusEnum.SUCCESS,
            error: null
          }
        })
        if (this.suggestion_enabled()) {
          const lastMessage = this.#messages()[this.#messages().length - 1]
          this.onSuggestionQuestions(lastMessage.id)
        }
      }
    })
  }

  cancelMessage() {
    this.chatSubscription?.unsubscribe()
    this.answering.set(false)

    // Update conversation status to indicate it's no longer busy
    // This will stop the relativeTimes pipe from updating (condition: conversationStatus === 'busy')
    this.conversation.update(
      (state) =>
        ({
          ...(state ?? {}),
          status: 'idle'
        }) as IChatConversation
    )

    // Update status of ai message
    this.updateLatestMessage((lastM) => {
      return {
        ...lastM,
        status: lastM.role === 'ai' ? XpertAgentExecutionStatusEnum.SUCCESS : lastM.status
      }
    })
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

  setConversation(id: string) {
    if (id !== this.conversationId()) {
      if (this.answering() && this.conversation()?.id) {
        this.cancelMessage()
      }
      this.contextUsageByAgentKey.set({})
      this.conversationId.set(id)
    }
  }

  setContextUsage(event: TThreadContextUsageEvent) {
    this.contextUsageByAgentKey.update((state) => upsertThreadContextUsage(state, event))
  }

  updateConversation(data: Partial<IChatConversation>) {
    this.conversation.update(
      (state) =>
        ({
          ...(state ?? {}),
          ...data
        }) as IChatConversation
    )
  }

  appendMessageComponent(content: TMessageContent, context?: TMessageAppendContext) {
    this.updateLatestMessage((lastM) => {
      appendMessageContent(lastM, content, context)
      return {
        ...lastM
      }
    })
  }

  appendStreamMessage(text: string, context?: TMessageAppendContext) {
    this.updateLatestMessage((lastM) => {
      appendMessageContent(lastM, text, context)
      return {
        ...lastM
      }
    })
  }

  updateLatestMessage(updateFn: (value: TCopilotChatMessage) => TCopilotChatMessage) {
    this.#messages.update((messages) => {
      const lastMessage = messages[messages.length - 1] as TCopilotChatMessage
      messages[messages.length - 1] = updateFn(lastMessage)
      return [...messages]
    })
  }

  abortMessage(id: string) {
    this.updateLatestMessage((lastMessage) => {
      if (lastMessage.id === id) {
        return { ...lastMessage, status: 'aborted' }
      }
      return lastMessage
    })
  }

  appendMessage(message: TCopilotChatMessage) {
    this.#messages.update((messages) => [...(messages ?? []), message])
  }

  updateEvent(event) {
    this.updateLatestMessage((lastMessage) => {
      return {
        ...lastMessage,
        event:
          event.event === ChatMessageEventTypeEnum.ON_AGENT_END
            ? null
            : {
                name: event.event,
                message: event.data.name
              },
        error: event.data.error
      }
    })
  }

  // Abstract methods
  abstract newConv(xpert?: IXpert): void
  abstract gotoTask(taskId: string): void
  abstract isPublic(): boolean

  // Attachments
  onAttachCreated(file: IStorageFile): void {
    //
  }
  onAttachDeleted(fileId: string): void {
    //
  }
  getRecentAttachmentsSignal() {
    return this.recentAttachments
  }
}
