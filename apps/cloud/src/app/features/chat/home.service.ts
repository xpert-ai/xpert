import { Injectable } from '@angular/core'
import { LanguagesEnum, OrderTypeEnum, XpertTypeEnum } from '../../@core/types'
import { derivedFrom } from 'ngxtension/derived-from'
import { map, pipe } from 'rxjs'
import { XpertHomeService } from '../../xpert'

@Injectable()
export class ChatHomeService extends XpertHomeService {
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
}
