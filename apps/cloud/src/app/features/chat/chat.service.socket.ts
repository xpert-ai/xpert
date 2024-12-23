import { Location } from '@angular/common'
import { DestroyRef, effect, inject, Injectable, signal } from '@angular/core'
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop'
import { CopilotBaseMessage, CopilotChatMessage, CopilotMessageGroup } from '../../@core/types'
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
  ChatGatewayEvent,
  ChatGatewayMessage,
  getErrorMessage,
  IChatConversation,
  IXpert,
  IXpertToolset,
  IKnowledgebase,
  LanguagesEnum,
  XpertTypeEnum,
} from '../../@core'
import { ChatConversationService, XpertService, ToastrService } from '../../@core/services'
import { AppService } from '../../app.service'
import { COMMON_COPILOT_ROLE } from './types'
import { TranslateService } from '@ngx-translate/core'
import { NGXLogger } from 'ngx-logger'
import { ChatWebsocketServer } from '../../@core/services/chat.service.socket'


@Injectable()
export class ChatWebsocketService {
  readonly chatService = inject(ChatWebsocketServer)
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
  readonly role$ = new BehaviorSubject<IXpert>(null)
  readonly conversation = signal<IChatConversation>(null)

  readonly messages = signal<CopilotBaseMessage[]>([])

  // Conversations
  readonly conversations = signal<IChatConversation[]>([])

  readonly knowledgebases = signal<IKnowledgebase[]>([])
  readonly toolsets = signal<IXpertToolset[]>([])

  readonly answering = signal<boolean>(false)

  readonly lang = this.appService.lang
  readonly roles = derivedFrom(
    [this.xpertService.getAllInOrg({ where: { type: XpertTypeEnum.Agent, latest: true }, relations: ['knowledgebases', 'toolsets'] }).pipe(map(({ items }) => items)), this.lang],
    pipe(
      map(([roles, lang]) => {
        if ([LanguagesEnum.SimplifiedChinese, LanguagesEnum.Chinese].includes(lang as LanguagesEnum)) {
          return roles?.map((role) => ({ ...role, title: role.titleCN }))
        } else {
          return roles
        }
      })
    ),
    { initialValue: [] }
  )
  
  readonly role = derivedFrom(
    [this.role$, this.lang],
    pipe(
      map(([role, lang]) => {
        if (!role) {
          role = {
            ...COMMON_COPILOT_ROLE,
            description: this.#translate.instant('PAC.Chat.CommonRoleDescription', {Default: 'Hi, how can I help? I can chat and search the knowledge base. Please select the appropriate role if you would like to use the tools.'})
          }
        }
        if ([LanguagesEnum.SimplifiedChinese, LanguagesEnum.Chinese].includes(lang as LanguagesEnum)) {
          return { ...role, title: role.titleCN }
        } else {
          return role
        }
      })
    )
  )

  private roleSub = this.role$
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
    .pipe(combineLatestWith(toObservable(this.roles)), withLatestFrom(this.role$), takeUntilDestroyed())
    .subscribe(([[paramRole, roles], role]) => {
      if (roles && role?.slug !== paramRole) {
        this.role$.next(roles.find((item) => item.slug === paramRole))
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
      combineLatestWith(toObservable(this.roles)),
      takeUntilDestroyed()
    )
    .subscribe({
      next: ([conversation, roles]) => {
        if (conversation) {
          this.role$.next(roles?.find((role) => role.id === conversation.xpertId))
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
      if (this.role$.value?.slug) {
        if (id) {
          this.#location.replaceState('/chat/r/' + this.role$.value.slug + '/c/' + id)
        } else {
          this.#location.replaceState('/chat/r/' + this.role$.value.slug)
        }
      } else if (id) {
        this.#location.replaceState('/chat/c/' + id)
      } else {
        this.#location.replaceState('/chat/')
      }
      // }
    })

  private chatListener = (result: ChatGatewayMessage) => {
    this.#logger.trace('message return:', result)
    switch (result.event) {
      case ChatGatewayEvent.ChainStart: {
        this.messages.update((items) => [
          ...items,
          {
            id: result.data.id,
            role: 'assistant',
            status: 'thinking'
          }
        ])
        break
      }
      case ChatGatewayEvent.ConversationCreated: {
        this.conversation.set({ ...result.data, messages: [...(this.messages() ?? [])] })
        this.conversations.update((items) => [{ ...result.data }, ...items])
        break
      }
      case ChatGatewayEvent.Message: {
        this.appendMessageStep(result.data)
        break
      }
      case ChatGatewayEvent.MessageStream: {
        this.appendStreamMessage(result.data.content)
        break
      }
      case ChatGatewayEvent.StepStart: {
        this.appendMessageStep(result.data)
        break
      }
      case ChatGatewayEvent.StepEnd: {
        this.updateMessageStep(result.data)
        break
      }
      case ChatGatewayEvent.ToolStart: {
        const toolCalls = Array.isArray(result.data) ? result.data : [result.data]
        toolCalls.forEach((item) => {
          // this.appendMessageStep(item)
        })
        break
      }
      case ChatGatewayEvent.ToolEnd: {
        const toolCalls = Array.isArray(result.data) ? result.data : [result.data]
        toolCalls.forEach((item) => {
          const { messages, ...step } = item
          this.updateMessageStep(step)
          if (messages?.length > 0) {
            messages.forEach((m) => this.appendStepMessage(step.id, m))
          }
        })
        break
      }
      case ChatGatewayEvent.ChainEnd: {
        this.answering.set(false)
        this.updateMessage(result.data.id, {
          status: 'done'
        })
        break
      }
      case ChatGatewayEvent.ChainAborted: {
        this.answering.set(false)
        if (this.conversation()?.id === result.data.conversationId) {
          this.abortMessage(result.data.id)
        }
        break
      }
      case ChatGatewayEvent.Error: {
        this.answering.set(false)
        this.updateMessage(result.data.id, {
          status: 'error',                                
          content: result.data.error
        })
        break
      }
      case ChatGatewayEvent.Agent: {
        this.appendStepMessage(result.data.id, result.data.message)
        break
      }
    }
  }

  // private websocket = toSignal(this.chatService.socket$.pipe(
  //   startWith(null),
  //   pairwise(),
  //   map(([prev, curr]) => {
  //     if (prev) {
  //       prev.off('message', this.chatListener)
  //     }
  //     curr?.on('message', this.chatListener)
  //     return curr
  //   })
  // ))

  private onMessageSub = this.chatService.onMessage().pipe(takeUntilDestroyed()).subscribe((data) => {
    this.chatListener(data)
  })

  constructor() {
    this.chatService.connect()
    // this.chatService.on('message', this.chatListener)

    effect(
      () => {
        if (this.conversation()) {
          this.messages.set(this.conversation().messages)
        } else {
          this.messages.set([])
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

  message(id: string, content: string) {
    return this.chatService.message({
      event: ChatGatewayEvent.MessageStream,
      xpert: {
        id: this.role$.value?.id,
        knowledgebases: this.knowledgebases().map(({ id }) => id),
        toolsets: this.toolsets()?.map(({ id }) => id)
      },
      data: {
        conversationId: this.conversation()?.id,
        id,
        language: this.appService.lang(),
        content
      }
    })
  }

  cancelMessage() {
    this.answering.set(false)
    return this.chatService.message({
      event: ChatGatewayEvent.CancelChain,
      data: {
        conversationId: this.conversation().id
      }
    })
  }

  async newConversation(role?: IXpert) {
    if (this.answering() && this.conversation()?.id) {
      this.cancelMessage()
    }
    this.conversation.set(null)
    this.conversationId.set(null)
    this.role$.next(role)
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

  updateMessage(id: string, message: Partial<CopilotBaseMessage>) {
    this.messages.update((messages) => {
      const lastMessage = messages[messages.length - 1] as CopilotMessageGroup
      messages[messages.length - 1] = { ...lastMessage, ...message }
      return [...messages]
    })
  }

  appendStreamMessage(content: string) {
    this.messages.update((messages) => {
      messages ??= []
      const lastMessage = messages[messages.length - 1] as CopilotMessageGroup
      lastMessage.content = (lastMessage.content ?? '') + content
      messages[messages.length - 1] = { ...lastMessage }
      return [...messages]
    })
  }

  appendMessageStep(step: CopilotChatMessage) {
    this.updateLatestMessage((lastMessage) => ({
      ...lastMessage,
      messages: [...(lastMessage.messages ?? []), step]
    }))
  }

  updateLatestMessage(updateFn: (value: CopilotMessageGroup) => CopilotMessageGroup) {
    this.messages.update((messages) => {
      const lastMessage = messages[messages.length - 1] as CopilotMessageGroup
      messages[messages.length - 1] = updateFn(lastMessage)
      return [...messages]
    })
  }

  appendStepMessage(id: string, subStep: CopilotChatMessage) {
    this.updateLatestMessage((lastMessage) => {
      const index = lastMessage.messages.findIndex((item) => item.id === id)
      if (index > -1) {
        // (<CopilotMessageGroup>lastMessage.messages[index]).messages ??= [];
        // (<CopilotMessageGroup>lastMessage.messages[index]).messages.push(subStep)
      }
      return {...lastMessage, messages: [...lastMessage.messages]}
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
    this.messages.update((messages) => [
      ...(messages ?? []),
      message
    ])
  }
}
