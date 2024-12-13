import { Location } from '@angular/common'
import { computed, DestroyRef, effect, inject, Injectable, signal } from '@angular/core'
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop'
import { nonNullable } from '@metad/ocap-core'
import { derivedFrom } from 'ngxtension/derived-from'
import { injectParams } from 'ngxtension/inject-params'
import {
  BehaviorSubject,
  catchError,
  combineLatestWith,
  distinctUntilChanged,
  filter,
  map,
  of,
  pipe,
  skip,
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
  LanguagesEnum,
  XpertTypeEnum,
  ChatMessageTypeEnum,
  uuid,
  CopilotBaseMessage,
  CopilotMessageGroup,
  CopilotChatMessage,
  ChatMessageEventTypeEnum,
  XpertAgentExecutionStatusEnum,
} from '../../@core'
import { ChatConversationService, ChatService as ChatServerService, XpertService, ToastrService } from '../../@core/services'
import { AppService } from '../../app.service'
import { COMMON_COPILOT_ROLE } from './types'
import { TranslateService } from '@ngx-translate/core'
import { NGXLogger } from 'ngx-logger'
import { ToolCall } from '@langchain/core/dist/messages/tool'


@Injectable()
export class ChatService {
  readonly chatService = inject(ChatServerService)
  readonly conversationService = inject(ChatConversationService)
  readonly xpertService = inject(XpertService)
  readonly appService = inject(AppService)
  readonly #translate = inject(TranslateService)
  readonly #logger = inject(NGXLogger)
  readonly #toastr = inject(ToastrService)
  readonly #location = inject(Location)
  readonly #destroyRef = inject(DestroyRef)
  readonly paramRole = injectParams('role')
  readonly paramId = injectParams('id')

  readonly conversationId = signal<string>(null)
  readonly xpert$ = new BehaviorSubject<IXpert>(null)
  readonly conversation = signal<IChatConversation>(null)

  readonly #messages = signal<CopilotBaseMessage[]>([])
  readonly messages = computed(() => this.#messages() ?? [])

  // Conversations
  readonly conversations = signal<IChatConversation[]>([])

  readonly knowledgebases = signal<IKnowledgebase[]>([])
  readonly toolsets = signal<IXpertToolset[]>([])

  readonly answering = signal<boolean>(false)

  readonly lang = this.appService.lang
  readonly xperts = derivedFrom(
    [
      this.xpertService.getMyAll({ where: { type: XpertTypeEnum.Agent, latest: true }, relations: ['knowledgebases', 'toolsets'] })
        .pipe(map(({ items }) => items)),
      this.lang
    ],
    pipe(
      map(([roles, lang]) => {
        if ([LanguagesEnum.SimplifiedChinese, LanguagesEnum.Chinese].includes(lang as LanguagesEnum)) {
          return roles?.map((role) => ({ ...role, title: role.titleCN || role.title }))
        } else {
          return roles
        }
      })
    ),
    { initialValue: [] }
  )

  readonly xpert = derivedFrom(
    [this.xpert$, this.lang],
    pipe(
      map(([role, lang]) => {
        if (!role) {
          role = {
            ...COMMON_COPILOT_ROLE,
            description: this.#translate.instant('PAC.Chat.CommonRoleDescription', {Default: 'Hi, how can I help? I can chat and search the knowledge base. Please select the appropriate role if you would like to use the tools.'})
          }
        }
        if ([LanguagesEnum.SimplifiedChinese, LanguagesEnum.Chinese].includes(lang as LanguagesEnum)) {
          return { ...role, title: role.titleCN || role.title }
        } else {
          return role
        }
      })
    )
  )

  private roleSub = this.xpert$
    .pipe(
      withLatestFrom(toObservable(this.paramRole)),
      filter(() => !this.conversationId()),
      takeUntilDestroyed()
    )
    .subscribe(([role, paramRole]) => {
      if (role?.slug === 'common') {
        this.#location.replaceState('/chat')
      } else if (role?.name && role.slug !== paramRole) {
        this.#location.replaceState('/chat/r/' + role.slug)
      }

      if (!this.conversationId()) {
        // 默认启用所有知识库
        this.knowledgebases.set(role?.knowledgebases ?? [])
        // 默认使用所有工具集
        this.toolsets.set(role?.toolsets ?? [])
      }
    })
  private paramRoleSub = toObservable(this.paramRole)
    .pipe(combineLatestWith(toObservable(this.xperts)), withLatestFrom(this.xpert$), takeUntilDestroyed())
    .subscribe(([[paramRole, roles], role]) => {
      if (roles && role?.slug !== paramRole) {
        this.xpert$.next(roles.find((item) => item.slug === paramRole))
      }
    })
  private idSub = toObservable(this.conversationId)
    .pipe(
      skip(1),
      filter((id) => !this.conversation() || this.conversation().id !== id),
      switchMap((id) =>
        id ? this.conversationService.getById(id, { relations: ['xpert', 'xpert.knowledgebases', 'xpert.toolsets'] }).pipe(
          catchError((error) => {
            this.#toastr.error(getErrorMessage(error))
            return of(null)
          }), 
        ) : of(null)
      ),
      tap((data) => {
        if (data) {
          this.conversation.set(data)
          this.knowledgebases.set(
            data.options?.knowledgebases?.map((id) => data.xpert?.knowledgebases?.find((item) => item.id === id)).filter(nonNullable)
          )
          this.toolsets.set(data.options?.toolsets?.map((id) => data.xpert?.toolsets?.find((item) => item.id === id)))
        } else {
          // New empty conversation
          this.conversation.set({} as IChatConversation)
        }
      }),
      combineLatestWith(toObservable(this.xperts)),
      takeUntilDestroyed()
    )
    .subscribe({
      next: ([conversation, roles]) => {
        if (conversation) {
          this.xpert$.next(roles?.find((role) => role.id === conversation.xpertId))
        }
      },
      error: (error) => {
        this.#toastr.error(getErrorMessage(error))
      }
    })

  private conversationSub = toObservable(this.conversation)
    .pipe(
      filter(nonNullable),
      map((conversation) => conversation?.id),
      distinctUntilChanged(),
      takeUntilDestroyed()
    )
    .subscribe((id) => {
      const roleName = this.paramRole()
      const paramId = this.paramId()
      // if (paramId !== id) {
      if (this.xpert$.value?.slug) {
        if (id) {
          this.#location.replaceState('/chat/r/' + this.xpert$.value.slug + '/c/' + id)
        } else {
          this.#location.replaceState('/chat/r/' + this.xpert$.value.slug)
        }
      } else if (id) {
        this.#location.replaceState('/chat/c/' + id)
      } else {
        this.#location.replaceState('/chat/')
      }
      // }
    })

  constructor() {
    effect(
      () => {
        if (this.conversation()) {
          this.#messages.set(this.conversation().messages)
        } else {
          this.#messages.set([])
        }
      },
      { allowSignalWrites: true }
    )

    effect(
      () => {
        if (this.paramId()) {
          this.conversationId.set(this.paramId())
        }
      },
      { allowSignalWrites: true }
    )

    this.#destroyRef.onDestroy(() => {
      if (this.answering() && this.conversation()?.id) {
        this.cancelMessage()
      }
    })
  }

  chat(options: Partial<{id: string; content: string; confirm: boolean; toolCalls: ToolCall[]; reject: boolean}>) {
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
      this.appendMessage({
        id: uuid(),
        role: 'assistant',
        content: ``,
        status: 'thinking'
      })
    }

    this.chatService.chat({
      input: {
        input: options.content,
      },
      xpertId: this.xpert$.value?.id,
      conversationId: this.conversation()?.id,
      id: options.id,
      toolCalls: options.toolCalls,
      confirm: options.confirm,
      reject: options.reject,
    }, {
      knowledgebases: this.knowledgebases().map(({ id }) => id),
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
              if ([ChatMessageEventTypeEnum.ON_CONVERSATION_START, ChatMessageEventTypeEnum.ON_CONVERSATION_END].includes(event.event)) {
                this.updateConversation(event.data)
              } else {
                this.updateEvent(event.event, event.data.error)
              }
            }
          }
        }
      },
      error: (error) => {
        this.#toastr.error(getErrorMessage(error))
        this.updateLatestMessage((message) => {
          return {
            ...message,
            status: XpertAgentExecutionStatusEnum.ERROR,
            error: getErrorMessage(error)
          }
        })
        this.answering.set(false)
      },
      complete: () => {
        this.updateLatestMessage((message) => {
          return {
            ...message,
            status: 'done',
            error: null
          }
        })
        this.answering.set(false)
      }
    })
  }

  cancelMessage() {
    this.answering.set(false)
    // return this.chatService.message({
    //   event: ChatGatewayEvent.CancelChain,
    //   data: {
    //     conversationId: this.conversation().id
    //   }
    // })
  }

  async newConversation(xpert?: IXpert) {
    if (this.answering() && this.conversation()?.id) {
      this.cancelMessage()
    }
    this.conversation.set(null)
    this.conversationId.set(null)
    this.xpert$.next(xpert)
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

  updateConversation(data: IChatConversation) {
    this.conversation.set({ ...data, messages: [...(this.messages() ?? [])] })
    if (!this.conversations().find((item) => item.id === data.id)) {
      this.conversations.update((items) => [{ ...data }, ...items])
    }
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
}
