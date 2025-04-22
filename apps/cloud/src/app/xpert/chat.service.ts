import { HttpErrorResponse } from '@angular/common/http'
import { computed, DestroyRef, effect, inject, Injectable, signal } from '@angular/core'
import { appendMessageContent } from '@metad/copilot'
import { linkedModel } from '@metad/core'
import { omit } from 'lodash-es'
import { NGXLogger } from 'ngx-logger'
import { derivedAsync } from 'ngxtension/derived-async'
import { catchError, combineLatest, map, of, startWith, Subscription } from 'rxjs'
import {
  ChatMessageEventTypeEnum,
  ChatMessageTypeEnum,
  getErrorMessage,
  IChatConversation,
  IChatMessageFeedback,
  IKnowledgebase,
  IXpert,
  IXpertToolset,
  TChatOptions,
  TChatRequest,
  TMessageContent,
  TSensitiveOperation,
  uuid,
  XpertAgentExecutionStatusEnum
} from '../@core'
import {
  ChatConversationService,
  ChatMessageFeedbackService,
  ChatService as ChatServerService,
  ToastrService,
  XpertService
} from '../@core/services'
import { AppService } from '../app.service'
import { XpertHomeService } from './home.service'
import { TCopilotChatMessage } from './types'

/**
 * The context of a single chat is not shared between conversations
 */
@Injectable()
export abstract class ChatService {
  readonly chatService = inject(ChatServerService)
  readonly conversationService = inject(ChatConversationService)
  readonly feedbackService = inject(ChatMessageFeedbackService)
  readonly xpertService = inject(XpertService)
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
  protected chatSubscription: Subscription = null

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
          this.getConversation(id).pipe(
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
          map(([conversation, feedbacks]) => {
            return {
              conversation,
              feedbacks,
              loading: false
            }
          }),
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
  readonly conversation = linkedModel({
    initialValue: null,
    compute: () => {
      return this.#conversation()?.conversation
    },
    update: () => {}
  })
  readonly loadingConv = linkedModel({
    initialValue: null,
    compute: () => {
      return this.#conversation()?.loading
    },
    update: () => {}
  })

  readonly #messages = linkedModel<TCopilotChatMessage[]>({
    initialValue: null,
    compute: () => this.conversation()?.messages ?? [],
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
  }

  getConversation(id: string) {
    return this.conversationService.getById(id, {
      relations: ['xpert', 'xpert.agent', 'xpert.agents', 'xpert.knowledgebases', 'xpert.toolsets', 'messages']
    })
  }

  getFeedbacks(id: string) {
    return this.feedbackService.getMyAll({ where: { conversationId: id } })
  }

  ask(content: string) {
    const id = uuid()
    this.appendMessage({
      id,
      role: 'user',
      content
    })
    // Send message
    this.chat({ id, content })
  }

  chatRequest(name: string, request: TChatRequest, options: TChatOptions) {
    return this.chatService.chat(request, options)
  }

  chat(
    options: Partial<{
      id: string
      content: string
      confirm: boolean
      operation: TSensitiveOperation
      reject: boolean
      retry: boolean
    }>
  ) {
    this.answering.set(true)
    this.conversation.update((state) => ({ ...(state ?? {}), status: 'busy' }) as IChatConversation)

    if (options.confirm) {
      this.updateLatestMessage((message) => {
        return {
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

    this.chatSubscription = this.chatRequest(
      this.xpert()?.slug,
      {
        input: {
          ...(this.parametersValue() ?? {}),
          input: options.content
        },
        xpertId: this.xpert()?.id,
        conversationId: this.conversation()?.id,
        id: options.id,
        operation: options.operation,
        confirm: options.confirm,
        reject: options.reject,
        retry: options.retry
      },
      {
        knowledgebases: this.knowledgebases()?.map(({ id }) => id),
        toolsets: this.toolsets()?.map(({ id }) => id)
      }
    ).subscribe({
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
              if (typeof event.data === 'string') {
                this.appendStreamMessage(event.data)
              } else {
                this.appendMessageComponent(event.data)
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
                case ChatMessageEventTypeEnum.ON_TOOL_MESSAGE: {
                  this.updateLatestMessage((message) => {
                    return {
                      ...message,
                      steps: [...(message.steps ?? []), event.data]
                    }
                  })

                  if (event.data && !this.homeService.canvasOpened()) {
                    this.homeService.canvasOpened.set({ type: 'Computer', opened: true })
                  }
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

  async newConversation1(xpert?: IXpert) {
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

  updateConversation(data: Partial<IChatConversation>) {
    this.conversation.update(
      (state) =>
        ({
          ...(state ?? {}),
          ...data
        }) as IChatConversation
    )
  }

  appendMessageComponent(content: TMessageContent) {
    this.updateLatestMessage((lastM) => {
      appendMessageContent(lastM as any, content)
      return {
        ...lastM
      }
    })
  }

  appendStreamMessage(text: string) {
    this.updateLatestMessage((lastM) => {
      const content = lastM.content
      lastM.status = 'answering'
      if (typeof content === 'string') {
        lastM.content = content + text
      } else if (Array.isArray(content)) {
        const lastContent = content[content.length - 1]
        if (lastContent.type === 'text') {
          content[content.length - 1] = {
            ...lastContent,
            text: lastContent.text + text
          }
          lastM.content = [...content]
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
    // console.log(event)
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

  //
  abstract newConv(xpert?: IXpert): void
}
