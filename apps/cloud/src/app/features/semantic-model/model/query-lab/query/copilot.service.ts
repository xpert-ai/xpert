import { Injectable, effect, inject } from '@angular/core'
import { NgmCopilotEngineService } from '@metad/copilot-angular'
import { TranslateService } from '@ngx-translate/core'
import { cloneDeep, isEqual } from 'lodash-es'
import { QueryService } from './query.service'

/**
 * Copilot Engine for query
 */
@Injectable()
export class QueryCopilotEngineService extends NgmCopilotEngineService {
  private readonly translateService = inject(TranslateService)
  readonly #queryService = inject(QueryService)

  #conversationSub = this.#queryService
    .select((state) => state.query?.conversations ?? [])
    .subscribe((conversations) => {
      this.conversations$.set(cloneDeep(conversations))
    })
  #nameSub = this.translateService.stream('PAC.MODEL.QUERY.CopilotName', { Default: 'Query Lab' }).subscribe((name) => {
    this.name = name
  })
  constructor() {
    super()

    effect(
      () => {
        if (this.#queryService.initialized()) {
          if (!isEqual(this.#queryService.conversations(), this.conversations$())) {
            this.#queryService.setConversations(this.conversations$())
          }
        }
      }
    )
  }

  // nl2SQL(sql: string): Observable<string> {
  //   return this.copilotService
  //     .chatCompletions([
  //       {
  //         id: nanoid(),
  //         role: CopilotChatMessageRoleEnum.System,
  //         content: `假如你是一个数据库管理员，已知数据库信息有：\n${this.dbTablesPrompt()}`
  //       },
  //       {
  //         id: nanoid(),
  //         role: CopilotChatMessageRoleEnum.User,
  //         content: `请根据给定的表信息和要求给出相应的SQL语句(仅输出 sql 语句)， 要求：\n${sql}，答案：`
  //       }
  //     ])
  //     .pipe(map(({ choices }) => choices[0]?.message?.content))
  // }

  // explainSQL(sql: string): Observable<string> {
  //   return this.copilotService
  //     .chatCompletions([
  //       {
  //         id: nanoid(),
  //         role: CopilotChatMessageRoleEnum.System,
  //         content: `假如你是一个数据库管理员，已知数据库信息有：\n${this.dbTablesPrompt()}`
  //       },
  //       {
  //         id: nanoid(),
  //         role: CopilotChatMessageRoleEnum.User,
  //         content: `请根据给定的表信息解释一下这个SQL语句：\n${sql}`
  //       }
  //     ])
  //     .pipe(map(({ choices }) => choices[0]?.message?.content))
  // }

  // optimizeSQL(sql: string): Observable<string> {
  //   return this.copilotService
  //     .chatCompletions([
  //       {
  //         id: nanoid(),
  //         role: CopilotChatMessageRoleEnum.System,
  //         content: `假如你是一个数据库管理员，已知数据库信息有：\n${this.dbTablesPrompt()}`
  //       },
  //       {
  //         id: nanoid(),
  //         role: CopilotChatMessageRoleEnum.User,
  //         content: `请根据给定的表信息优化一下这个SQL语句(仅输出 sql 语句)：\n${sql}`
  //       }
  //     ])
  //     .pipe(map(({ choices }) => choices[0]?.message?.content))
  // }

  // ask(prompt: string): Observable<string> {
  //   return this.copilotService
  //     .chatCompletions([
  //       {
  //         id: nanoid(),
  //         role: CopilotChatMessageRoleEnum.System,
  //         content: `假如你是一个数据库管理员，已知数据库信息有：\n${this.dbTablesPrompt()}`
  //       },
  //       {
  //         id: nanoid(),
  //         role: CopilotChatMessageRoleEnum.User,
  //         content: `${prompt}`
  //       }
  //     ])
  //     .pipe(map(({ choices }) => choices[0]?.message?.content))
  // }
}
