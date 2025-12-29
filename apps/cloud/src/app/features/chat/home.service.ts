import { computed, Injectable, signal } from '@angular/core'
import { IChatConversation, injectXpertPreferences } from '@metad/cloud/state'
import { derivedFrom } from 'ngxtension/derived-from'
import { map, Observable, pipe, shareReplay } from 'rxjs'
import { IXpert, LanguagesEnum, OrderTypeEnum, XpertTypeEnum } from '../../@core/types'
import { XpertHomeService } from '../../xpert'

@Injectable()
export class ChatHomeService extends XpertHomeService {
  readonly #preferences = injectXpertPreferences()

  /**
   * Latest conversation updated by ChatPlatformService, used to update the history list in real-time
   */
  readonly latestConversation = signal<IChatConversation>(null)

  readonly xperts = derivedFrom(
    [
      this.xpertService
        .getMyAll({
          relations: ['createdBy'],
          where: { type: XpertTypeEnum.Agent, latest: true },
          order: { createdAt: OrderTypeEnum.DESC }
        })
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

  readonly xpert = signal<IXpert>(null)

  readonly sortOrder = computed(() => this.#preferences()?.sortOrder)

  readonly sortedXperts = computed(() => {
    const xperts = this.xperts()
    const sortOrder = this.sortOrder()
    if (xperts && sortOrder) {
      const sortOrderMap = new Map(sortOrder.map((id, index) => [id, index]))
      return [...xperts].sort(
        (a, b) =>
          (sortOrderMap.get(a.id) ?? 0) - (sortOrderMap.get(b.id) ?? 0) ||
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      )
    }

    return xperts
  })

  // Xperts details
  readonly #xperts: Record<string, Observable<IXpert>> = {}

  getXpert(slug: string) {
    if (!this.#xperts[slug]) {
      this.#xperts[slug] = this.xpertService.getBySlug(slug).pipe(shareReplay(1))
    }
    return this.#xperts[slug]
  }

  /**
   *
   */
  selectPublicSemanticModel(id: string) {
    return this.selectSemanticModel(id)
  }
}
