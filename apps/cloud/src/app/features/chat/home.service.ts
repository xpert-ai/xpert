import { inject, Injectable, signal } from '@angular/core'
import { IChatConversation, LanguagesEnum, OrderTypeEnum, XpertTypeEnum } from '@metad/contracts'
import { derivedFrom } from 'ngxtension/derived-from'
import { map, pipe } from 'rxjs'
import { ChatConversationService, XpertService } from '../../@core'
import { AppService } from '../../app.service'

@Injectable()
export class ChatHomeService {
  readonly appService = inject(AppService)
  readonly xpertService = inject(XpertService)
  readonly conversationService = inject(ChatConversationService)
  readonly lang = this.appService.lang

  readonly conversations = signal<IChatConversation[]>([])
  readonly conversationId = signal<string>(null)
  
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

  deleteConversation(id: string) {
    this.conversations.update((items) => items.filter((item) => item.id !== id))
    this.conversationService.delete(id).subscribe({
      next: () => {}
    })
  }
}
