import { Location } from '@angular/common'
import { effect, inject, Injectable } from '@angular/core'
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop'
import { nonNullable } from '@metad/ocap-core'
import { TranslateService } from '@ngx-translate/core'
import { derivedFrom } from 'ngxtension/derived-from'
import { injectParams } from 'ngxtension/inject-params'
import { combineLatestWith, distinctUntilChanged, filter, map, pipe, withLatestFrom } from 'rxjs'
import {
  ChatMessageEventTypeEnum,
  ChatMessageTypeEnum,
  getErrorMessage,
  IXpert,
  LanguagesEnum,
  OrderTypeEnum,
  ToolCall,
  uuid,
  XpertAgentExecutionStatusEnum,
  XpertTypeEnum
} from '../../@core'
import { ToastrService } from '../../@core/services'
import { ChatService } from '../../xpert/'
import { COMMON_COPILOT_ROLE } from './types'

@Injectable()
export class ChatPlatformService extends ChatService {
  readonly #translate = inject(TranslateService)
  readonly #toastr = inject(ToastrService)
  readonly #location = inject(Location)
  readonly paramRole = injectParams('role')
  readonly paramId = injectParams('id')

  readonly xperts = derivedFrom(
    [
      this.xpertService
        .getMyAll({ where: { type: XpertTypeEnum.Agent, latest: true }, order: { createdAt: OrderTypeEnum.DESC } })
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
    { initialValue: null }
  )

  readonly xpert = derivedFrom(
    [this.xpert$, this.lang],
    pipe(
      map(([role, lang]) => {
        if (!role) {
          role = {
            ...COMMON_COPILOT_ROLE,
            description: this.#translate.instant('PAC.Chat.CommonRoleDescription', {
              Default:
                'Hi, how can I help? I can chat and search the knowledge base. Please select the appropriate role if you would like to use the tools.'
            })
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
    super()
    effect(
      () => {
        if (this.paramId()) {
          this.conversationId.set(this.paramId())
        }
      },
      { allowSignalWrites: true }
    )
  }

  // chat(
  //   options: Partial<{
  //     id: string
  //     content: string
  //     confirm: boolean
  //     toolCalls: ToolCall[]
  //     reject: boolean
  //     retry: boolean
  //   }>
  // ) {
  //   this.answering.set(true)

  //   if (options.confirm) {
  //     this.updateLatestMessage((message) => {
  //       return {
  //         ...message,
  //         status: 'thinking'
  //       }
  //     })
  //   } else if (options.content) {
  //     // Add ai message placeholder
  //     // this.appendMessage({
  //     //   id: uuid(),
  //     //   role: 'assistant',
  //     //   content: ``,
  //     //   status: 'thinking'
  //     // })
  //   }

  //   this.chatSubscription = this.chatService
  //     .chat(
  //       {
  //         input: {
  //           input: options.content
  //         },
  //         xpertId: this.xpert$.value?.id,
  //         conversationId: this.conversation()?.id,
  //         id: options.id,
  //         toolCalls: options.toolCalls,
  //         confirm: options.confirm,
  //         reject: options.reject,
  //         retry: options.retry
  //       },
  //       {
  //         knowledgebases: this.knowledgebases()?.map(({ id }) => id),
  //         toolsets: this.toolsets()?.map(({ id }) => id)
  //       }
  //     )
  //     .subscribe({
  //       next: (msg) => {
  //         if (msg.event === 'error') {
  //           this.#toastr.error(msg.data)
  //         } else {
  //           if (msg.data) {
  //             const event = JSON.parse(msg.data)
  //             if (event.type === ChatMessageTypeEnum.MESSAGE) {
  //               if (typeof event.data === 'string') {
  //                 this.appendStreamMessage(event.data)
  //               } else {
  //                 this.appendMessageComponent(event.data)
  //               }
  //             } else if (event.type === ChatMessageTypeEnum.EVENT) {
  //               switch (event.event) {
  //                 case ChatMessageEventTypeEnum.ON_CONVERSATION_START:
  //                 case ChatMessageEventTypeEnum.ON_CONVERSATION_END:
  //                   this.updateConversation(event.data)
  //                   if (event.data.status === 'error') {
  //                     this.updateLatestMessage((lastM) => {
  //                       return {
  //                         ...lastM,
  //                         status: XpertAgentExecutionStatusEnum.ERROR
  //                       }
  //                     })
  //                   }
  //                   break
  //                 case ChatMessageEventTypeEnum.ON_MESSAGE_START:
  //                   if (options.content) {
  //                     this.appendMessage({
  //                       id: uuid(),
  //                       role: 'ai',
  //                       content: ``,
  //                       status: 'thinking'
  //                     })
  //                   }
  //                   this.updateLatestMessage((lastM) => {
  //                     return {
  //                       ...lastM,
  //                       ...event.data
  //                     }
  //                   })
  //                   break
  //                 case ChatMessageEventTypeEnum.ON_MESSAGE_END:
  //                   this.updateLatestMessage((lastM) => {
  //                     return {
  //                       ...lastM,
  //                       status: event.data.status,
  //                       error: event.data.error
  //                     }
  //                   })
  //                   break
  //                 default:
  //                   this.updateEvent(event.event, event.data.error)
  //               }
  //             }
  //           }
  //         }
  //       },
  //       error: (error) => {
  //         this.answering.set(false)
  //         this.#toastr.error(getErrorMessage(error))
  //         this.updateLatestMessage((message) => {
  //           return {
  //             ...message,
  //             status: XpertAgentExecutionStatusEnum.ERROR,
  //             error: getErrorMessage(error)
  //           }
  //         })
  //       },
  //       complete: () => {
  //         this.answering.set(false)
  //         this.updateLatestMessage((message) => {
  //           return {
  //             ...message,
  //             status: XpertAgentExecutionStatusEnum.SUCCESS,
  //             error: null
  //           }
  //         })
  //       }
  //     })
  // }

  async newConversation(xpert?: IXpert) {
    await super.newConversation()
    this.xpert$.next(xpert)
  }
}
