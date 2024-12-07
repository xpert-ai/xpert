import { inject, Injectable } from '@angular/core'
import { API_PREFIX, OrganizationBaseCrudService, SystemPrivacyFields } from '@metad/cloud/state'
import { Indicator } from '@metad/ocap-core'
import { omit } from 'lodash-es'
import { NGXLogger } from 'ngx-logger'
import { BehaviorSubject, map, switchMap } from 'rxjs'
import { IChatBIConversation, IUser, OrderTypeEnum } from '../types'

const API_CHATBI_CONVERSATION = API_PREFIX + '/chatbi-conversation'

export interface ChatbiConverstion<T = any> {
  id?: string
  key: string
  name: string
  modelId: string
  dataSource: string
  entity: string
  command: string
  messages: any[] // CopilotChatMessage[]
  indicators: Indicator[]
  answer: T
  examples: string[]
  createdBy?: IUser
}

@Injectable({ providedIn: 'root' })
export class ChatBIConversationService extends OrganizationBaseCrudService<IChatBIConversation> {
  readonly #logger = inject(NGXLogger)
  // readonly httpClient = inject(HttpClient)

  readonly #refresh = new BehaviorSubject<void>(null)

  constructor() {
    super(API_CHATBI_CONVERSATION)
  }

  getMy() {
    return this.selectOrganizationId().pipe(
      switchMap(() =>
        this.httpClient.get<{ items: IChatBIConversation[]; total: number; }>(API_CHATBI_CONVERSATION + '/my', {
          params: {
            data: JSON.stringify({
              relation: ['createdBy'],
              take: 20,
              skip: 0,
              order: {
                createdAt: OrderTypeEnum.DESC
              }
            })
          } as any
        })
      ),
      map(({ items }) => items.map(convertChatBIConversationResult))
    )
  }

  getById(id: string) {
    return super.getById(id)
      .pipe(map(convertChatBIConversationResult))
  }

  upsert(entity: Partial<ChatbiConverstion>) {
    return entity.id
      ? this.httpClient
          .put<ChatbiConverstion>(`${API_CHATBI_CONVERSATION}/${entity.id}`, convertChatBIConversation(entity))
          .pipe(map(() => entity as ChatbiConverstion))
      : this.httpClient
          .post<ChatbiConverstion>(API_CHATBI_CONVERSATION, convertChatBIConversation(entity))
          .pipe(map((result) => convertChatBIConversationResult(result)))
  }

  // delete(id: string) {
  //   return this.httpClient.delete(`${API_CHATBI_CONVERSATION}/${id}`)
  // }

  refresh() {
    this.#refresh.next()
  }
}

export function convertChatBIConversation(input: Partial<ChatbiConverstion>) {
  const { messages, indicators, answer, examples, ...rest } = input
  return {
    ...rest,
    options: {
      messages,
      indicators,
      answer,
      examples,
    }
  } as IChatBIConversation
}

export function convertChatBIConversationResult(result: IChatBIConversation) {
  return {
    ...(result.options ?? {}),
    ...omit(result, 'options', ...SystemPrivacyFields),
    createdBy: result.createdBy
  } as ChatbiConverstion
}
