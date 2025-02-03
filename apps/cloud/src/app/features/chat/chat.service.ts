import { Location } from '@angular/common'
import { effect, inject, Injectable } from '@angular/core'
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop'
import { nonNullable } from '@metad/ocap-core'
import { TranslateService } from '@ngx-translate/core'
import { derivedFrom } from 'ngxtension/derived-from'
import { injectParams } from 'ngxtension/inject-params'
import { combineLatestWith, distinctUntilChanged, filter, map, pipe, withLatestFrom } from 'rxjs'
import {
  IXpert,
  LanguagesEnum,
} from '../../@core'
import { ToastrService } from '../../@core/services'
import { ChatService } from '../../xpert/'
import { COMMON_COPILOT_ROLE } from './types'
import { ChatHomeService } from './home.service'

@Injectable()
export class ChatPlatformService extends ChatService {
  readonly #translate = inject(TranslateService)
  readonly homeService = inject(ChatHomeService)
  readonly #toastr = inject(ToastrService)
  readonly #location = inject(Location)
  readonly paramRole = injectParams('role')
  readonly paramId = injectParams('id')

  readonly xperts = this.homeService.xperts

  // readonly xpert = derivedFrom(
  //   [this.xpert$, this.lang],
  //   pipe(
  //     map(([role, lang]) => {
  //       if (!role) {
  //         role = {
  //           ...COMMON_COPILOT_ROLE,
  //           description: this.#translate.instant('PAC.Chat.CommonRoleDescription', {
  //             Default:
  //               'Hi, how can I help? I can chat and search the knowledge base. Please select the appropriate role if you would like to use the tools.'
  //           })
  //         }
  //       }
  //       if ([LanguagesEnum.SimplifiedChinese, LanguagesEnum.Chinese].includes(lang as LanguagesEnum)) {
  //         return { ...role, title: role.titleCN || role.title }
  //       } else {
  //         return role
  //       }
  //     })
  //   )
  // )

  private roleSub = toObservable(this.xpert)
    .pipe(
      withLatestFrom(toObservable(this.paramRole)),
      filter(() => !this.conversationId()),
      takeUntilDestroyed()
    )
    .subscribe(([role, paramRole]) => {
      if (role?.slug === 'common') {
        this.#location.replaceState('/chat')
      } else if (role?.name && role.slug !== paramRole) {
        this.#location.replaceState('/chat/x/' + role.slug)
      }

      if (!this.conversationId()) {
        // 默认启用所有知识库
        this.knowledgebases.set(role?.knowledgebases ?? [])
        // 默认使用所有工具集
        this.toolsets.set(role?.toolsets ?? [])
      }
    })
  // private paramRoleSub = toObservable(this.paramRole)
  //   .pipe(combineLatestWith(toObservable(this.xperts)), takeUntilDestroyed())
  //   .subscribe(([paramRole, roles]) => {
  //     if (roles && this.xpert()?.slug !== paramRole) {
  //       this.xpert$.next(roles.find((item) => item.slug === paramRole))
  //     }
  //   })

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
      if (this.xpert()?.slug) {
        if (id) {
          this.#location.replaceState('/chat/x/' + this.xpert().slug + '/c/' + id)
        } else {
          this.#location.replaceState('/chat/x/' + this.xpert().slug)
        }
      } else if (id) {
        this.#location.replaceState('/chat/c/' + id)
      } else {
        this.#location.replaceState('/chat/')
      }
      // }
      this.homeService.conversationId.set(id)
    })

  constructor() {
    super()
    effect(
      () => {
        if (this.paramId()) {
          this.conversationId.set(this.paramId())
        } else {
          this.conversationId.set(null)
        }
      },
      { allowSignalWrites: true }
    )
  }

  async newConversation(xpert?: IXpert) {
    await super.newConversation()
    this.xpert$.next(xpert)
  }
}
