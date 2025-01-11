import { Location } from '@angular/common'
import { computed, DestroyRef, effect, inject, Injectable, signal } from '@angular/core'
import { takeUntilDestroyed, toObservable, toSignal } from '@angular/core/rxjs-interop'
import { Indicator, nonNullable } from '@metad/ocap-core'
import { injectParams } from 'ngxtension/inject-params'
import {
  BehaviorSubject,
  catchError,
  combineLatest,
  distinctUntilChanged,
  filter,
  map,
  of,
  skip,
  Subscription,
  switchMap,
  tap,
  withLatestFrom
} from 'rxjs'
import {
  getErrorMessage,
  IChatConversation,
  IXpert,
  IXpertToolset,
  IKnowledgebase,
  XpertTypeEnum,
  ChatMessageTypeEnum,
  uuid,
  CopilotBaseMessage,
  CopilotMessageGroup,
  CopilotChatMessage,
  ChatMessageEventTypeEnum,
  XpertAgentExecutionStatusEnum,
  IChatMessage,
  ToolCall,
  IChatMessageFeedback,
  ISemanticModel,
  TChatOptions,
  TChatRequest,
} from '../@core'
import { ChatConversationService, ChatService as ChatServerService, XpertService, ToastrService, ChatMessageFeedbackService } from '../@core/services'
import { AppService } from '../app.service'
import { TranslateService } from '@ngx-translate/core'
import { NGXLogger } from 'ngx-logger'
import { sortBy } from 'lodash-es'
import { HttpErrorResponse } from '@angular/common/http'
import { format } from 'date-fns/format'
import { isToday } from 'date-fns/isToday'
import { isWithinInterval } from 'date-fns/isWithinInterval'
import { isYesterday } from 'date-fns/isYesterday'
import { subDays } from 'date-fns/subDays'


@Injectable()
export class ChatService {
  readonly chatService = inject(ChatServerService)
  readonly conversationService = inject(ChatConversationService)
  readonly feedbackService = inject(ChatMessageFeedbackService)
  readonly xpertService = inject(XpertService)
  readonly appService = inject(AppService)
  readonly #translate = inject(TranslateService)
  readonly #logger = inject(NGXLogger)
  readonly #toastr = inject(ToastrService)
  readonly #location = inject(Location)
  readonly #destroyRef = inject(DestroyRef)


  readonly conversationId = signal<string>(null)
  readonly xpert$ = new BehaviorSubject<IXpert>(null)
  /**
   * The conversation
   */
  readonly conversation = signal<IChatConversation>(null)
  readonly loadingConv = signal(false)
  /**
   * User feedbacks for messages of the conversation
   */
  readonly feedbacks = signal<Record<string, IChatMessageFeedback>>(null)

  /**
   * Messages in the conversation
   */
  readonly #messages = signal<IChatMessage[]>([])
  readonly messages = computed(() => this.#messages() ?? [])

  // Conversations
  readonly conversations = signal<IChatConversation[]>([])

  readonly knowledgebases = signal<IKnowledgebase[]>([])
  readonly toolsets = signal<IXpertToolset[]>([])

  readonly answering = signal<boolean>(false)
  protected chatSubscription: Subscription = null

  readonly lang = this.appService.lang

  readonly xpert = toSignal(this.xpert$)

  // SemanticModels
  readonly #semanticModels = signal<
    Record<
      string,
      {
        model?: ISemanticModel
        indicators?: Indicator[]
        dirty?: boolean
      }
    >
  >({})

  // private paramRoleSub = toObservable(this.paramRole)
  //   .pipe(
  //     filter(nonNullable),
  //     switchMap((slug) => this.getXpert(slug)),
  //     map(({ items }) => items),
  //     takeUntilDestroyed())
  //   .subscribe((xperts) => {
  //     if (!xperts[0]) {
  //       this.#toastr.error('PAC.Messages.NoPermissionOrNotExist', this.paramRole(), {Default: 'No permission or does not exist'})
  //     } else {
  //       this.xpert$.next(xperts[0])
  //     }
  //   })

  private idSub = toObservable(this.conversationId)
    .pipe(
      skip(1),
      filter((id) => !this.conversation() || this.conversation().id !== id),
      switchMap((id) =>
        id ? combineLatest([
            this.getConversation(id)
            .pipe(
              catchError((httpError: HttpErrorResponse) => {
                if (httpError.status === 404) {
                  this.#toastr.error('PAC.Messages.NoPermissionOrNotExist', 'PAC.KEY_WORDS.Conversation', {Default: 'No permission or does not exist'})
                } else {
                  this.#toastr.error(getErrorMessage(httpError))
                }
                return of(null)
              })
            ),
          this.getFeedbacks(id)
        ]).pipe(
          catchError((error) => {
            this.#toastr.error(getErrorMessage(error))
            return of([])
          }), 
        ) : of([])
      ),
      tap(([conv, feedbacks]) => {
        this.loadingConv.set(false)
        if (conv) {
          this.conversation.set(conv)
          this.#messages.set(sortBy(conv.messages, 'createdAt'))
          this.knowledgebases.set(
            conv.options?.knowledgebases?.map((id) => conv.xpert?.knowledgebases?.find((item) => item.id === id)).filter(nonNullable)
          )
          this.toolsets.set(conv.options?.toolsets?.map((id) => conv.xpert?.toolsets?.find((item) => item.id === id)))
        } else {
          // New empty conversation
          this.conversation.set({} as IChatConversation)
          this.#messages.set([])
        }

        this.feedbacks.set(feedbacks?.items.reduce((acc, feedback) => {
          acc[feedback.messageId] = feedback
          return acc
        }, {}))
      }),
      takeUntilDestroyed()
    )
    .subscribe({
      next: ([conversation]) => {
        if (conversation) {
          this.xpert$.next(conversation.xpert)
        }
      },
      error: (error) => {
        this.loadingConv.set(false)
        this.#toastr.error(getErrorMessage(error))
      }
    })



  constructor() {
    this.#destroyRef.onDestroy(() => {
      if (this.answering() && this.conversation()?.id) {
        this.cancelMessage()
      }
    })
  }

  getXpert(slug: string) {
    return this.xpertService.getMyAll({ where: { slug, type: XpertTypeEnum.Agent, latest: true } })
  }

  getConversation(id: string) {
    this.loadingConv.set(true)
    return this.conversationService.getById(id, { relations: ['xpert', 'xpert.knowledgebases', 'xpert.toolsets', 'messages'] })
  }

  getFeedbacks(id: string) {
    return this.feedbackService.getMyAll({ where: { conversationId: id, } })
  }

  chatRequest(name: string, request: TChatRequest, options: TChatOptions) {
    return this.chatService.chat(request, options)
  }

  chat(options: Partial<{id: string; content: string; confirm: boolean; toolCalls: ToolCall[]; reject: boolean; retry: boolean}>) {
    this.answering.set(true)

    if (options.confirm) {
      this.updateLatestMessage((message) => {
        return{
          ...message,
          status: 'thinking'
        }
      })
    } else if (options.content) {
      // Add ai message placeholder
      // this.appendMessage({
      //   id: uuid(),
      //   role: 'assistant',
      //   content: ``,
      //   status: 'thinking'
      // })
    }

    this.chatSubscription = this.chatRequest(this.xpert().slug, {
        input: {
          input: options.content,
        },
        xpertId: this.xpert$.value?.id,
        conversationId: this.conversation()?.id,
        id: options.id,
        toolCalls: options.toolCalls,
        confirm: options.confirm,
        reject: options.reject,
        retry: options.retry,
      }, {
        knowledgebases: this.knowledgebases()?.map(({ id }) => id),
        toolsets: this.toolsets()?.map(({ id }) => id)
      })
      .subscribe({
        next: (msg) => {
          if (msg.event === 'error') {
            this.#toastr.error(msg.data)
          } else {
            if (msg.data) {
              const event = JSON.parse(msg.data)
              if (event.type === ChatMessageTypeEnum.MESSAGE) {
                if (typeof event.data === 'string') {
                  this.appendStreamMessage(event.data)
                } else {
                  this.appendMessageComponent(event.data)
                }
              } else if (event.type === ChatMessageTypeEnum.EVENT) {
                switch(event.event) {
                  case ChatMessageEventTypeEnum.ON_CONVERSATION_START:
                  case ChatMessageEventTypeEnum.ON_CONVERSATION_END:
                    this.updateConversation(event.data)
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
                    if (options.content) {
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
                    break;
                  case ChatMessageEventTypeEnum.ON_MESSAGE_END:
                    this.updateLatestMessage((lastM) => {
                      return {
                        ...lastM,
                        status: event.data.status,
                        error: event.data.error,
                      }
                    })
                    break;
                  default:
                    this.updateEvent(event.event, event.data.error)
                }
              }
            }
          }
        },
        error: (error) => {
          this.answering.set(false)
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
          this.updateLatestMessage((message) => {
            return {
              ...message,
              status: XpertAgentExecutionStatusEnum.SUCCESS,
              error: null
            }
          })
        }
      })
  }

  cancelMessage() {
    this.chatSubscription?.unsubscribe()
    this.answering.set(false)
    // Update status of ai message
    this.updateLatestMessage((lastM) => {
      return {
        ...lastM,
        status: lastM.role === 'ai' ? XpertAgentExecutionStatusEnum.SUCCESS : lastM.status
      }
    })
  }

  async newConversation(xpert?: IXpert) {
    if (this.answering() && this.conversation()?.id) {
      this.cancelMessage()
    }
    this.conversation.set(null)
    this.conversationId.set(null)
    this.#messages.set([])
  }

  setConversation(id: string) {
    if (id !== this.conversationId()) {
      if (this.answering() && this.conversation()?.id) {
        this.cancelMessage()
      }
      this.conversationId.set(id)
    }
  }

  deleteConversation(id: string) {
    this.conversations.update((items) => items.filter((item) => item.id !== id))
    this.conversationService.delete(id).subscribe({
      next: () => {}
    })
  }

  updateConversation(data: Partial<IChatConversation>) {
    this.conversation.update((state) => ({
      ...(state ?? {}),
      ...data,
      messages: null
    } as IChatConversation))
    this.conversations.update((items) => {
      const index = items.findIndex((_) => _.id === this.conversation().id)
      if (index > -1) {
        items[index] = {
          ...items[index],
          ...this.conversation()
        }
        return [...items]
      } else {
        return  [{ ...this.conversation() }, ...items]
      }
    })
  }

  updateMessage(id: string, message: Partial<CopilotBaseMessage>) {
    this.#messages.update((messages) => {
      const lastMessage = messages[messages.length - 1] as CopilotMessageGroup
      messages[messages.length - 1] = { ...lastMessage, ...message }
      return [...messages]
    })
  }

  appendMessageComponent(message) {
    this.updateLatestMessage((lastM) => {
      const content = lastM.content
      if (typeof content === 'string') {
        lastM.content = [
          {
            type: 'text',
            text: content
          },
          message
        ]
      } else if (Array.isArray(content)) {
        lastM.content = [
          ...content,
          message
        ]
      } else {
        lastM.content = [
          message
        ]
      }
      return {
        ...lastM
      }
    })
  }

  appendStreamMessage(text: string) {
    this.updateLatestMessage((lastM) => {
      const content = lastM.content

      if (typeof content === 'string') {
        lastM.content = content + text
      } else if (Array.isArray(content)) {
        const lastContent = content[content.length - 1]
        if (lastContent.type === 'text') {
          content[content.length - 1] = {
            ...lastContent,
            text: lastContent.text + text
          }
          lastM.content = [
            ...content,
          ]
        } else {
          lastM.content = [
            ...content,
            {
              type: 'text',
              text
            }
          ]
        }
      } else {
        lastM.content = text
      }

      return {
        ...lastM
      }
    })
  }

  appendMessageStep(step: CopilotChatMessage) {
    this.updateLatestMessage((lastMessage) => ({
      ...lastMessage,
      messages: [...(lastMessage.messages ?? []), step]
    }))
  }

  updateLatestMessage(updateFn: (value: CopilotMessageGroup) => CopilotMessageGroup) {
    this.#messages.update((messages) => {
      const lastMessage = messages[messages.length - 1] as CopilotMessageGroup
      messages[messages.length - 1] = updateFn(lastMessage)
      return [...messages]
    })
  }

  updateMessageStep(step: CopilotChatMessage) {
    this.updateLatestMessage((lastMessage) => {
      const _steps = lastMessage.messages.reverse()
      const index = _steps.findIndex((item) => item.id === step.id && item.role === step.role)
      if (index > -1) {
        _steps[index] = {
          ..._steps[index],
          ...step
        }
        lastMessage.messages = _steps.reverse()
      }
      return {...lastMessage}
    })
  }

  abortMessage(id: string) {
    this.updateLatestMessage((lastMessage) => {
      if (lastMessage.id === id) {
        lastMessage.messages = lastMessage.messages?.map((m) => {
          if (m.status === 'thinking') {
            return { ...m, status: 'aborted' }
          }
          return m
        })

        return { ...lastMessage, status: 'aborted' }
      }
      return lastMessage
    })
  }

  appendMessage(message: CopilotBaseMessage) {
    this.#messages.update((messages) => [
      ...(messages ?? []),
      message
    ])
  }

  updateEvent(event: string, error: string) {
    this.updateLatestMessage((lastMessage) => {
      return {
        ...lastMessage,
        event: event === ChatMessageEventTypeEnum.ON_AGENT_END ? null : event,
        error
      }
    })
  }

  /**
   * Collect the semantic models and the corresponding runtime indicators to be registered.
   * 
   * @param models Model id and runtime indicators
   */
  registerSemanticModel(models: { id: string; indicators?: Indicator[] }[]) {
    this.#semanticModels.update((state) => {
      models.forEach(({ id, indicators }) => {
        state[id] ??= {}
        if (indicators) {
          state[id].indicators ??= []
          state[id].indicators = [
            ...state[id].indicators.filter((_) => !indicators.some((i) => i.code === _.code)),
            ...indicators
          ]
        }
      })
      return { ...state }
    })
  }
  
}

export function groupConversations(conversations: IChatConversation[]) {
  // 定义分组时间段
  const startOfToday = new Date()
  const startOfLast7Days = subDays(startOfToday, 7)
  const startOfLast30Days = subDays(startOfToday, 30)
  const groups: { name: string; values: IChatConversation[] }[] = []
  let currentGroup: (typeof groups)[0] = null
  conversations.forEach((item) => {
    const recordDate = new Date(item.updatedAt)
    let name = ''
    if (isToday(recordDate)) {
      name = 'Today'
    } else if (isYesterday(recordDate)) {
      name = 'Yesterday'
    } else if (isWithinInterval(recordDate, { start: startOfLast7Days, end: startOfToday })) {
      name = 'Last7Days'
    } else if (isWithinInterval(recordDate, { start: startOfLast30Days, end: startOfLast7Days })) {
      name = 'Last30Days'
    } else {
      // 按月份分组
      const monthKey = format(recordDate, 'yyyy-MM') //{locale: eoLocale});
      name = monthKey
    }

    if (name !== currentGroup?.name) {
      currentGroup = {
        name,
        values: [item]
      }
      groups.push(currentGroup)
    } else {
      currentGroup.values.push(item)
    }
  })

  return groups
}